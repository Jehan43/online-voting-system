// Input checks. The frontend checks these too, but the backend always checks again.
const { HttpError } = require("./httpError");

// ---------- Email ----------

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function isValidEmail(email) {
  return email.length > 0 && email.length <= 254 && /^\S+@\S+\.\S+$/.test(email);
}

// ---------- Password ----------

// A small list of very common passwords. Add more if you like.
const COMMON_PASSWORDS = [
  "password1", "password@1", "password@123", "password123", "passw0rd", "p@ssw0rd",
  "p@ssword1", "pass@1234", "pass@word1", "qwerty123", "qwerty@123", "admin123",
  "admin@123", "welcome1", "welcome@123", "letmein123", "iloveyou1", "abc12345",
  "abc@1234", "abcd@1234", "abcd1234", "12345678", "123456789", "1234567890",
  "test@1234", "user@1234", "hello@123", "hello123", "india@123", "india123",
  "changeme1", "football1", "monkey123", "dragon123", "master123", "login123",
];

// Returns an error message, or null if the password is fine.
function checkPassword(password, email) {
  if (typeof password !== "string" || password === "") return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (Buffer.byteLength(password) > 72) return "Password must be at most 72 characters.";
  if (!/[A-Z]/.test(password)) return "Password needs at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password needs at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password needs at least one number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password needs at least one symbol.";

  const lower = password.toLowerCase();
  const emailName = String(email || "").split("@")[0].toLowerCase();
  if (emailName.length >= 3 && lower.includes(emailName)) {
    return "Password must not contain your email name.";
  }
  const tooCommon =
    COMMON_PASSWORDS.includes(lower) ||
    lower.includes("password") ||
    lower.includes("qwerty") ||
    lower.includes("123456");
  if (tooCommon) return "This password is too common. Please choose a different one.";

  return null;
}

// ---------- IDs ----------

// Turns a URL parameter into a number, or answers 404 if it is not a valid ID.
function parseId(value, notFoundMessage) {
  if (!/^\d{1,9}$/.test(String(value))) {
    throw new HttpError(404, notFoundMessage || "Not found.");
  }
  return Number(value);
}

// ---------- Vote form ----------

function bad(message) {
  throw new HttpError(400, message);
}

// Checks the body of POST /votes and PUT /votes/:id.
// Returns clean values: { title, description, options, opensAt, closesAt }
function validateVoteInput(body) {
  body = body || {};

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) bad("Title is required.");
  if (title.length > 200) bad("Title must be at most 200 characters.");

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) bad("Description is required.");
  if (description.length > 2000) bad("Description must be at most 2000 characters.");

  if (!Array.isArray(body.options)) bad("Options must be a list.");
  if (body.options.length > 50) bad("A vote can have at most 50 options.");
  const options = body.options.map((o) => (typeof o === "string" ? o.trim() : ""));
  if (options.some((o) => o === "")) bad("Options cannot be empty.");
  if (options.some((o) => o.length > 200)) bad("Each option must be at most 200 characters.");
  if (options.length < 2) bad("Add at least 2 options.");
  const lowered = options.map((o) => o.toLowerCase());
  if (new Set(lowered).size !== lowered.length) bad("Options must not repeat.");

  if (typeof body.opens_at !== "string" || typeof body.closes_at !== "string") {
    bad("Open time and close time are required.");
  }
  const opensAt = new Date(body.opens_at);
  const closesAt = new Date(body.closes_at);
  if (isNaN(opensAt.getTime()) || isNaN(closesAt.getTime())) {
    bad("Open time and close time must be valid dates.");
  }
  if (closesAt <= opensAt) bad("Close time must be after open time.");

  return { title, description, options, opensAt, closesAt };
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  checkPassword,
  parseId,
  validateVoteInput,
};
