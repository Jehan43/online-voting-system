// Builds the Express app: security middleware, rate limits, routes, error handling.
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const config = require("./config");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const voterRoutes = require("./routes/voterRoutes");

const app = express();

// Behind CloudFront + the load balancer the real client IP is in X-Forwarded-For.
if (config.trustProxy > 0) {
  app.set("trust proxy", config.trustProxy);
}

app.use(helmet());
if (config.corsOrigin) {
  const origins = config.corsOrigin.split(",").map((o) => o.trim());
  app.use(cors({ origin: origins }));
}
app.use(express.json({ limit: "100kb" }));

// Health check for the load balancer (GET /health every 30 seconds).
app.get(["/health", "/api/health"], (req, res) => {
  res.json({ status: "ok" });
});

// API responses (tokens, results, receipt status) must never be cached by browsers or CloudFront.
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// ---------- Rate limiting (per IP) ----------
function limiter(max, windowMs) {
  return rateLimit({
    windowMs: windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests. Please slow down and try again shortly." },
  });
}
app.use("/api", limiter(config.rateLimits.apiPerMinute, 60 * 1000));

// ---------- Routes (all under /api, as in API_CONTRACT.md) ----------
app.use("/api/auth", limiter(config.rateLimits.authPer15Min, 15 * 60 * 1000), authRoutes);
app.use("/api/receipt", limiter(config.rateLimits.receiptPerMinute, 60 * 1000)); // stops code guessing
app.use("/api/votes", adminRoutes);
app.use("/api", voterRoutes);

// ---------- Not found ----------
app.use((req, res) => {
  res.status(404).json({ message: "Endpoint not found." });
});

// ---------- Error handler: every error becomes { "message": "..." } ----------
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "The request body is not valid JSON." });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ message: "The request body is too large." });
  }
  if (err.status) {
    // An HttpError we threw on purpose (400, 401, 403, 409, 429, 502...): the message is safe to show.
    return res.status(err.status).json({ message: err.message, ...(err.extra || {}) });
  }

  // Unexpected error: log the details, show a general message.
  console.error("Unexpected error:", err);
  res.status(500).json({ message: "Something went wrong on the server. Please try again." });
});

module.exports = app;
