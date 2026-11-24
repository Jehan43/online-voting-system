// Reads all settings from environment variables (.env file locally).
// To move from local PostgreSQL to AWS RDS you only change these values.
require("dotenv").config();

const env = process.env;

const config = {
  nodeEnv: env.NODE_ENV || "development",
  port: Number(env.PORT) || 3000,
  trustProxy: Number(env.TRUST_PROXY) || 0,
  corsOrigin: env.CORS_ORIGIN || "",

  jwtSecret: env.JWT_SECRET || "",
  jwtExpiresIn: "30m", // token lifetime from the design document

  db: {
    host: env.DB_HOST || "localhost",
    port: Number(env.DB_PORT) || 5432,
    database: env.DB_NAME || "voting",
    user: env.DB_USER || "postgres",
    password: env.DB_PASSWORD || "",
    ssl: env.DB_SSL === "true",
    poolMax: Number(env.DB_POOL_MAX) || 10,
  },

  awsRegion: env.AWS_REGION || "us-east-1",
  emailMode: env.EMAIL_MODE || "console", // "console", "ses" or "brevo"
  sesFromEmail: env.FROM_EMAIL || "",
  brevoApiKey: env.BREVO_API_KEY || "",

  queueMode: env.QUEUE_MODE || "local", // "local" or "sqs"
  sqsQueueUrl: env.SQS_QUEUE_URL || "",
  runWorker: env.RUN_WORKER !== "false",

  rateLimits: {
    apiPerMinute: Number(env.RATE_LIMIT_API_PER_MINUTE) || 3000,
    authPer15Min: Number(env.RATE_LIMIT_AUTH_PER_15_MIN) || 1000,
    receiptPerMinute: Number(env.RATE_LIMIT_RECEIPT_PER_MINUTE) || 20,
  },
};

// Called once when the server starts. Stops with a clear message if something is wrong.
config.validate = function () {
  if (config.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters. See .env.example.");
  }
  if (!["console", "ses", "brevo"].includes(config.emailMode)) {
    throw new Error('EMAIL_MODE must be "console", "ses" or "brevo".');
  }
  if (config.emailMode === "ses" && !config.sesFromEmail) {
    throw new Error("FROM_EMAIL is required when EMAIL_MODE=ses.");
  }
  if (config.emailMode === "brevo" && (!config.brevoApiKey || !config.sesFromEmail)) {
    throw new Error("BREVO_API_KEY and FROM_EMAIL are required when EMAIL_MODE=brevo.");
  }
  if (config.emailMode === "console" && config.nodeEnv === "production") {
    throw new Error("EMAIL_MODE=console is not allowed when NODE_ENV=production.");
  }
  if (!["local", "sqs"].includes(config.queueMode)) {
    throw new Error('QUEUE_MODE must be "local" or "sqs".');
  }
  if (config.queueMode === "sqs" && !config.sqsQueueUrl) {
    throw new Error("SQS_QUEUE_URL is required when QUEUE_MODE=sqs.");
  }
};

module.exports = config;