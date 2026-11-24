// JWT creation and the two middleware functions that protect routes.
const jwt = require("jsonwebtoken");
const config = require("./config");
const { HttpError } = require("./httpError");

// The token carries the user ID and role, and is valid for 30 minutes.
function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: config.jwtExpiresIn,
  });
}

// Requires "Authorization: Bearer <token>". Sets req.user = { id, role }.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    throw new HttpError(401, "Please log in.");
  }

  let payload;
  try {
    payload = jwt.verify(parts[1], config.jwtSecret, { algorithms: ["HS256"] });
  } catch (err) {
    // expired or tampered token
    throw new HttpError(401, "Your session has expired. Please log in again.");
  }

  req.user = { id: Number(payload.sub), role: payload.role };
  next();
}

// Use after requireAuth:  requireRole("admin")  or  requireRole("voter")
function requireRole(role) {
  return function (req, res, next) {
    if (req.user.role !== role) {
      throw new HttpError(
        403,
        role === "admin" ? "Only admins can do this." : "Only voters can do this."
      );
    }
    next();
  };
}

module.exports = { signToken, requireAuth, requireRole };
