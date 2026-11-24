// Creates (or upgrades) an admin account:
//   npm run create-admin -- admin@example.com "Str0ng!Password"
// Admin accounts cannot be created through the website; signup always makes voters.
const bcrypt = require("bcryptjs");
const { query, pool } = require("../src/db");
const { normalizeEmail, isValidEmail, checkPassword } = require("../src/validators");

async function main() {
  const email = normalizeEmail(process.argv[2]);
  const password = process.argv[3];

  if (!isValidEmail(email) || !password) {
    console.error('Usage: npm run create-admin -- admin@example.com "Str0ng!Password"');
    process.exit(1);
  }
  const problem = checkPassword(password, email);
  if (problem) {
    console.error("Password not accepted: " + problem);
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  const existing = await query("SELECT id FROM users WHERE LOWER(email) = $1", [email]);

  if (existing.rowCount > 0) {
    await query(
      "UPDATE users SET role = 'admin', is_verified = TRUE, password_hash = $2, failed_attempts = 0, locked_until = NULL WHERE id = $1",
      [existing.rows[0].id, hash]
    );
    console.log("Existing account " + email + " is now an admin (password updated).");
  } else {
    await query(
      "INSERT INTO users (email, password_hash, role, is_verified) VALUES ($1, $2, 'admin', TRUE)",
      [email, hash]
    );
    console.log("Admin account created: " + email);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("Failed: " + err.message);
  process.exit(1);
});
