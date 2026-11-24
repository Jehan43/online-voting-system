// Voter routes, mounted at /api:
//   GET  /v/:linkId           vote details (voters)
//   POST /v/:linkId/cast      queue a vote (voters)
//   GET  /cast/:requestId     check if a queued vote was saved (voters)
//   GET  /receipt/:code       check a receipt code (voters)
//   GET  /votes/:id/results   results after the vote closes (any logged-in user)
const express = require("express");
const { query } = require("../db");
const { HttpError } = require("../httpError");
const { requireAuth, requireRole } = require("../auth");
const { parseId } = require("../validators");
const { effectiveStatus } = require("../voteHelpers");
const { sendVoteJob } = require("../queue");

const router = express.Router();
const voterOnly = [requireAuth, requireRole("voter")];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Loads a published vote from its link ID, or answers 404.
async function loadVoteByLink(linkId) {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(linkId)) {
    throw new HttpError(404, "Voting link not found.");
  }
  const result = await query("SELECT * FROM votes WHERE link_id = $1", [linkId]);
  if (result.rowCount === 0) throw new HttpError(404, "Voting link not found.");
  return result.rows[0];
}

// Open and close times are checked here, on the server.
function checkVoteIsOpen(vote) {
  if (effectiveStatus(vote) === "closed") {
    throw new HttpError(410, "Voting is closed.", { voteId: vote.id });
  }
  if (new Date() < new Date(vote.opens_at)) {
    throw new HttpError(
      403,
      "Voting has not opened yet. It opens on " + new Date(vote.opens_at).toUTCString() + "."
    );
  }
}

async function checkNotVotedYet(vote, userId) {
  const result = await query("SELECT 1 FROM voted WHERE vote_id = $1 AND user_id = $2", [vote.id, userId]);
  if (result.rowCount > 0) {
    throw new HttpError(409, "You have already voted in this vote.", { voteId: vote.id });
  }
}

// GET /api/v/:linkId -> { id, title, description, status: "open", opens_at, closes_at, options }
router.get("/v/:linkId", voterOnly, async (req, res) => {
  const vote = await loadVoteByLink(req.params.linkId);
  checkVoteIsOpen(vote);
  await checkNotVotedYet(vote, req.user.id);

  const options = await query("SELECT id, label FROM options WHERE vote_id = $1 ORDER BY position", [vote.id]);
  res.json({
    id: vote.id,
    title: vote.title,
    description: vote.description,
    status: "open",
    opens_at: vote.opens_at,
    closes_at: vote.closes_at,
    options: options.rows,
  });
});

// POST /api/v/:linkId/cast  { optionId } -> 202 { requestId }
// The vote is queued; GET /cast/:requestId tells when it is saved.
router.post("/v/:linkId/cast", voterOnly, async (req, res) => {
  const vote = await loadVoteByLink(req.params.linkId);
  checkVoteIsOpen(vote);
  await checkNotVotedYet(vote, req.user.id);

  const optionId = Number((req.body || {}).optionId);
  if (!Number.isInteger(optionId) || optionId <= 0) {
    throw new HttpError(400, "Choose an option.");
  }
  const option = await query("SELECT 1 FROM options WHERE id = $1 AND vote_id = $2", [optionId, vote.id]);
  if (option.rowCount === 0) {
    throw new HttpError(400, "That option does not exist in this vote.");
  }

  // This row has no user and no option (see schema.sql), so it cannot link a person to a ballot.
  const created = await query("INSERT INTO cast_requests (vote_id) VALUES ($1) RETURNING request_id", [vote.id]);
  const requestId = created.rows[0].request_id;

  try {
    await sendVoteJob({ requestId, voteId: vote.id, userId: req.user.id, optionId });
  } catch (err) {
    console.error("Could not queue vote:", err.message);
    await query("DELETE FROM cast_requests WHERE request_id = $1", [requestId]);
    throw new HttpError(503, "Could not queue your vote. Please try again.");
  }

  res.status(202).json({ requestId });
});

// GET /api/cast/:requestId -> { status: "pending" | "done" | "failed", receiptCode?, message? }
router.get("/cast/:requestId", voterOnly, async (req, res) => {
  if (!UUID_PATTERN.test(req.params.requestId)) {
    throw new HttpError(404, "Unknown vote request.");
  }
  const result = await query(
    "SELECT status, receipt_code, message FROM cast_requests WHERE request_id = $1",
    [req.params.requestId]
  );
  if (result.rowCount === 0) throw new HttpError(404, "Unknown vote request.");

  const row = result.rows[0];
  if (row.status === "done") return res.json({ status: "done", receiptCode: row.receipt_code });
  if (row.status === "failed") return res.json({ status: "failed", message: row.message });
  res.json({ status: "pending" });
});

// GET /api/receipt/:code -> { valid: true }  (404 if the code does not exist)
router.get("/receipt/:code", voterOnly, async (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  if (code.length === 0 || code.length > 30) {
    throw new HttpError(404, "Receipt code not found.");
  }
  const result = await query("SELECT 1 FROM ballots WHERE receipt_code = $1", [code]);
  if (result.rowCount === 0) throw new HttpError(404, "Receipt code not found.");
  res.json({ valid: true });
});

// GET /api/votes/:id/results -> { title, total, results: [ { optionId, label, count } ] }
router.get("/votes/:id/results", requireAuth, async (req, res) => {
  const voteId = parseId(req.params.id, "Vote not found.");
  const voteResult = await query("SELECT * FROM votes WHERE id = $1", [voteId]);
  if (voteResult.rowCount === 0 || voteResult.rows[0].status === "draft") {
    throw new HttpError(404, "Vote not found.");
  }
  const vote = voteResult.rows[0];

  // Results stay hidden until the vote closes.
  if (effectiveStatus(vote) !== "closed") {
    throw new HttpError(403, "Results are hidden until the vote closes.");
  }

  // Votes cast just before closing may still be in the queue: wait for them.
  const pending = await query(
    `SELECT 1 FROM cast_requests
     WHERE vote_id = $1 AND status = 'pending' AND created_at > NOW() - INTERVAL '10 minutes'
     LIMIT 1`,
    [vote.id]
  );
  if (pending.rowCount > 0) {
    throw new HttpError(503, "Some votes are still being counted. Please try again in a minute.");
  }

  const counts = await query(
    `SELECT o.id AS "optionId", o.label, COUNT(b.id)::int AS count
     FROM options o
     LEFT JOIN ballots b ON b.option_id = o.id
     WHERE o.vote_id = $1
     GROUP BY o.id, o.label, o.position
     ORDER BY o.position`,
    [vote.id]
  );
  const total = counts.rows.reduce((sum, row) => sum + row.count, 0);
  res.json({ title: vote.title, total, results: counts.rows });
});

module.exports = router;
