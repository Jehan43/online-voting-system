// Small helpers shared by the vote routes and the vote processor.
const crypto = require("crypto");

// The status stored in the database can be "open" even after the close time has passed.
// This returns the real status, checked against the SERVER clock (never the browser's).
function effectiveStatus(vote) {
  if (vote.status === "open" && new Date() >= new Date(vote.closes_at)) {
    return "closed";
  }
  return vote.status;
}

// Random, hard-to-guess link ID: 16 random bytes = 22 URL-safe characters.
function newLinkId() {
  return crypto.randomBytes(16).toString("base64url");
}

// Random receipt code like "K7QM-2XPA-9WDT". Letters I and O and digits 0 and 1 are
// left out so the code is easy to read and type.
const RECEIPT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newReceiptCode() {
  let code = "";
  for (let i = 0; i < 12; i++) {
    code += RECEIPT_ALPHABET[crypto.randomInt(RECEIPT_ALPHABET.length)];
    if (i % 4 === 3 && i < 11) code += "-";
  }
  return code;
}

module.exports = { effectiveStatus, newLinkId, newReceiptCode };
