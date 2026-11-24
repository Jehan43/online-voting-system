// /api/auth/*  - signup, OTP verification, login, resend.
const express = require("express");
const bcrypt = require("bcryptjs");
const { query } = require("../db");
const { HttpError } = require("../httpError");
const { signToken } = require("../auth");
const { sendOtp, verifyOtp } = require("../otp");
const { normalizeEmail, isValidEmail, checkPassword } = require("../validators");

const router = express.Router();

const MAX_FAILED_LOGINS = 5;
// Used so a login for an unknown email takes as long as a real one.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

async function findUserByEmail(email) {
  const result = await query("SELECT * FROM users WHERE LOWER(email) = $1", [email]);
  return result.rows[0] || null;
}

function checkOtpFormat(otp) {
  if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
    throw new HttpError(400, "Enter the 6-digit code.");
  }
}

// POST /api/auth/signup  { email, password } -> 201 { message }
router.post("/signup", async (req, res) => {
  const body = req.body || {};
  const email = normalizeEmail(body.email);
  const password = body.password;

  if (!isValidEmail(email)) throw new HttpError(400, "Enter a valid email address.");
  const passwordProblem = checkPassword(password, email);
  if (passwordProblem) throw new HttpError(400, passwordProblem);

  const passwordHash = await bcrypt.hash(password, 10);
  let user = await findUserByEmail(email);

  if (user && user.is_verified) {
    throw new HttpError(409, "This email is already registered. Please log in.");
  }
  if (user) {
    // Signed up before but never verified: let them try again with a new password.
    await query("UPDATE users SET password_hash = $2 WHERE id = $1", [user.id, passwordHash]);
  } else {
    try {
      const created = await query(
        "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'voter') RETURNING *",
        [email, passwordHash]
      );
      user = created.rows[0];
    } catch (err) {
      if (err.code === "23505") {
        throw new HttpError(409, "This email is already registered. Please log in.");
      }
      throw err;
    }
  }

  await sendOtp(user, "signup");
  res.status(201).json({ message: "Account created. We sent a 6-digit code to your email." });
});

// POST /api/auth/verify-otp  { email, otp } -> 200 { message }   (signup code)
router.post("/verify-otp", async (req, res) => {
  const body = req.body || {};
  const email = normalizeEmail(body.email);
  checkOtpFormat(body.otp);

  const user = await findUserByEmail(email);
  if (!user) throw new HttpError(400, "Invalid code.");
  if (user.is_verified) {
    throw new HttpError(400, "This account is already verified. Please log in.");
  }

  await verifyOtp(user.id, "signup", body.otp);
  await query("UPDATE users SET is_verified = TRUE WHERE id = $1", [user.id]);
  res.json({ message: "Email verified. You can now log in." });
});

// POST /api/auth/login  { email, password } -> 200 { message }   (login code is emailed)
router.post("/login", async (req, res) => {
  const body = req.body || {};
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!isValidEmail(email) || !password) {
    throw new HttpError(400, "Enter your email and password.");
  }

  const user = await findUserByEmail(email);
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw new HttpError(401, "Wrong email or password.");
  }

  // Locked after 5 wrong passwords, for 15 minutes.
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    throw new HttpError(
      423,
      "Account locked because of too many wrong passwords. Try again in " + minutes + " minute(s)."
    );
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    const updated = await query(
      `UPDATE users SET
         failed_attempts = CASE WHEN failed_attempts + 1 >= $2 THEN 0 ELSE failed_attempts + 1 END,
         locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END
       WHERE id = $1
       RETURNING locked_until`,
      [user.id, MAX_FAILED_LOGINS]
    );
    const lockedUntil = updated.rows[0].locked_until;
    if (lockedUntil && new Date(lockedUntil) > new Date()) {
      throw new HttpError(423, "Too many wrong passwords. Your account is locked for 15 minutes.");
    }
    throw new HttpError(401, "Wrong email or password.");
  }

  if (user.failed_attempts > 0 || user.locked_until) {
    await query("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1", [user.id]);
  }

  // Correct password but the email was never verified: send a signup code instead.
  if (!user.is_verified) {
    try {
      await sendOtp(user, "signup");
    } catch (err) {
      if (err.status !== 429) throw err; // a 429 just means a code was sent a moment ago
    }
    throw new HttpError(
      403,
      "Your email is not verified yet. We sent a verification code to your email."
    );
  }

  await sendOtp(user, "login");
  res.json({ message: "We sent a 6-digit login code to your email." });
});

// POST /api/auth/login/verify-otp  { email, otp } -> 200 { token, role }
router.post("/login/verify-otp", async (req, res) => {
  const body = req.body || {};
  const email = normalizeEmail(body.email);
  checkOtpFormat(body.otp);

  const user = await findUserByEmail(email);
  if (!user || !user.is_verified) throw new HttpError(400, "Invalid code.");
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new HttpError(423, "Account locked. Please try again later.");
  }

  await verifyOtp(user.id, "login", body.otp);
  res.json({ token: signToken(user), role: user.role });
});

// POST /api/auth/resend-otp  { email, purpose: "signup" | "login" } -> 200 { message }
router.post("/resend-otp", async (req, res) => {
  const body = req.body || {};
  const email = normalizeEmail(body.email);
  const purpose = body.purpose;
  if (!isValidEmail(email)) throw new HttpError(400, "Enter a valid email address.");
  if (purpose !== "signup" && purpose !== "login") {
    throw new HttpError(400, 'Purpose must be "signup" or "login".');
  }

  // The answer is the same whether or not the account exists, so this cannot be used to find emails.
  const generic = { message: "If the account exists, a new code was sent." };
  const user = await findUserByEmail(email);
  if (!user) return res.json(generic);
  if (purpose === "signup" && user.is_verified) return res.json(generic);
  if (purpose === "login") {
    const locked = user.locked_until && new Date(user.locked_until) > new Date();
    if (!user.is_verified || locked) return res.json(generic);
  }

  await sendOtp(user, purpose);
  res.json(generic);
});

module.exports = router;
