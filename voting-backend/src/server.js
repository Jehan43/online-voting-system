// Starts the API server (and the SQS vote worker when QUEUE_MODE=sqs).
const config = require("./config");
config.validate();

const app = require("./app");
const { pool, query } = require("./db");
const { startWorker, stopWorker } = require("./queue");

const server = app.listen(config.port, () => {
  console.log("Voting API listening on port " + config.port + " (" + config.nodeEnv + ")");
  console.log("Email mode: " + config.emailMode + " | Queue mode: " + config.queueMode);
});

server.keepAliveTimeout=65000;
server.headersTimeout=66000;

// Check the database connection once at start-up so problems show up immediately.
query("SELECT 1").then(
  () => console.log("Database connection OK."),
  (err) => console.error("DATABASE CONNECTION FAILED: " + err.message)
);

// Delete old vote-status rows every 10 minutes (they are only needed for a short time).
const cleanupTimer = setInterval(() => {
  query("DELETE FROM cast_requests WHERE created_at < NOW() - INTERVAL '1 hour'").catch((err) =>
    console.error("Cleanup failed:", err.message)
  );
}, 10 * 60 * 1000);

startWorker();

// Stop cleanly when the server is told to stop (PM2 restart, Auto Scaling shutdown).
function shutdown() {
  console.log("Shutting down...");
  clearInterval(cleanupTimer);
  stopWorker();
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 10000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
