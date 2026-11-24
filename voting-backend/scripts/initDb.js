// Creates all tables:  npm run db:init
// Reads the connection settings from .env (local PostgreSQL or AWS RDS).
const fs = require("fs");
const path = require("path");
const { pool } = require("../src/db");

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
  await pool.query(sql);
  console.log("Database tables are ready.");
  await pool.end();
}

main().catch((err) => {
  console.error("Could not set up the database: " + err.message);
  if (err.code === "ECONNREFUSED") {
    console.error("PostgreSQL is not reachable. Is it running, and are DB_HOST and DB_PORT correct?");
  } else if (err.code === "3D000") {
    console.error("The database does not exist yet. Create it first (see README.md).");
  } else if (err.code === "28P01") {
    console.error("Wrong database user or password. Check DB_USER and DB_PASSWORD in .env.");
  }
  process.exit(1);
});
