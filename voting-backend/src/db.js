// PostgreSQL connection pool. Works the same for local PostgreSQL and AWS RDS:
// only the DB_* environment variables change.
const { Pool } = require("pg");
const config = require("./config");

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: config.db.poolMax, // about 10 connections per API server
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // RDS needs SSL. "rejectUnauthorized: false" keeps setup simple for a college project;
  // see README for how to verify the RDS certificate instead.
  ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  console.error("Unexpected database error:", err.message);
});

// Run one query:  const result = await query("SELECT * FROM users WHERE id = $1", [id]);
function query(text, params) {
  return pool.query(text, params);
}

// Run several queries as ONE transaction. If anything throws, everything is rolled back.
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      // ignore: the original error is more important
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
