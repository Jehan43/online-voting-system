// One-time codes: create + email, and check.
// Rules (design document): 6 digits, valid 5 minutes, used once, stored hashed,
// 3 wrong attempts, resend once per 30 seconds, at most 5 codes per hour.
const crypto = require("crypto");
const config = require("./config");
const { query } = require("./db");
const { HttpError } = require("./httpError");
const { sendOtpEmail } = require("./email");

const VALID_MINUTES = 5;
const MAX_WRONG_ATTEMPTS = 3;
const COOLDOWN_SECONDS = 30;
const MAX_SENDS_PER_HOUR = 5;

// Keyed hash (HMAC) so a stolen database cannot be used to guess the 6-digit codes.
function hashCode(userId, purpose, code) {
  return crypto
    .createHmac("sha256", config.jwtSecret)
    .update(userId + ":" + purpose + ":" + code)
    .digest("hex");
}

function sameHash(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Creates a new code (cancelling the old one) and emails it.
// purpose is "signup" or "login".
async function sendOtp(user, purpose) {
  const now = new Date();

  // Resend limits
  const existing = await query(
    "SELECT last_sent_at, window_started_at, send_count FROM otp_codes WHERE user_id = $1",
    [user.id]
  );
  let windowStart = now;
  let sendCount = 0;
  if (existing.rowCount > 0) {
    const row = existing.rows[0];
    const secondsSinceLast = (now - new Date(row.last_sent_at)) / 1000;
    if (secondsSinceLast < COOLDOWN_SECONDS) {
      const wait = Math.ceil(COOLDOWN_SECONDS - secondsSinceLast);
      throw new HttpError(429, "Please wait " + wait + " seconds before requesting a new code.");
    }
    if (now - new Date(row.window_started_at) < 60 * 60 * 1000) {
      windowStart = new Date(row.window_started_at);
      sendCount = row.send_count;
    }
    if (sendCount >= MAX_SENDS_PER_HOUR) {
      throw new HttpError(429, "Too many codes requested. Please try again in an hour.");
    }
  }

  // Six random digits
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const expiresAt = new Date(now.getTime() + VALID_MINUTES * 60 * 1000);

  await query(
    `INSERT INTO otp_codes
       (user_id, purpose, code_hash, expires_at, attempts, last_sent_at, window_started_at, send_count)
     VALUES ($1, $2, $3, $4, 0, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET
       purpose = EXCLUDED.purpose,
       code_hash = EXCLUDED.code_hash,
       expires_at = EXCLUDED.expires_at,
       attempts = 0,
       last_sent_at = EXCLUDED.last_sent_at,
       window_started_at = EXCLUDED.window_started_at,
       send_count = EXCLUDED.send_count`,
    [user.id, purpose, hashCode(user.id, purpose, code), expiresAt, now, windowStart, sendCount + 1]
  );

  await sendOtpEmail(user.email, code, purpose);
}

// Checks the code. Throws an HttpError if it is wrong, expired or blocked.
// Returns normally only when the code is correct (and then it can never be used again).
async function verifyOtp(userId, purpose, code) {
  const result = await query(
    "SELECT purpose, code_hash, expires_at, attempts FROM otp_codes WHERE user_id = $1",
    [userId]
  );
  if (result.rowCount === 0 || result.rows[0].purpose !== purpose) {
    throw new HttpError(400, "No active code. Please request a new code.");
  }
  const row = result.rows[0];

  if (new Date() > new Date(row.expires_at)) {
    throw new HttpError(400, "This code has expired. Please request a new one.");
  }
  if (row.attempts >= MAX_WRONG_ATTEMPTS) {
    throw new HttpError(429, "Too many wrong attempts. Please request a new code.");
  }

  if (sameHash(row.code_hash, hashCode(userId, purpose, code))) {
    // Delete the code so it cannot be used twice (two requests at once: only one wins).
    const deleted = await query(
      "DELETE FROM otp_codes WHERE user_id = $1 AND code_hash = $2",
      [userId, row.code_hash]
    );
    if (deleted.rowCount === 0) {
      throw new HttpError(400, "No active code. Please request a new code.");
    }
    return;
  }

  const updated = await query(
    "UPDATE otp_codes SET attempts = attempts + 1 WHERE user_id = $1 RETURNING attempts",
    [userId]
  );
  const left = MAX_WRONG_ATTEMPTS - updated.rows[0].attempts;
  if (left <= 0) {
    throw new HttpError(429, "Too many wrong attempts. Please request a new code.");
  }
  throw new HttpError(400, "Wrong code. " + left + (left === 1 ? " attempt" : " attempts") + " left.");
}

module.exports = { sendOtp, verifyOtp };
