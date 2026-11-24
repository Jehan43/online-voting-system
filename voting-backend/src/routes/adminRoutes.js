// /api/votes/*  - admin only. Create, edit, publish, close, link and turnout.
// An admin can only see and change the votes they created.
const express = require("express");
const { query, withTransaction } = require("../db");
const { HttpError } = require("../httpError");
const { requireAuth, requireRole } = require("../auth");
const { parseId, validateVoteInput } = require("../validators");
const { effectiveStatus, newLinkId } = require("../voteHelpers");

const router = express.Router();
const adminOnly = [requireAuth, requireRole("admin")];

// Loads a vote that belongs to this admin, or answers 404.
async function findOwnVote(voteId, adminId) {
  const result = await query("SELECT * FROM votes WHERE id = $1 AND created_by = $2", [voteId, adminId]);
  if (result.rowCount === 0) throw new HttpError(404, "Vote not found.");
  return result.rows[0];
}

async function insertOptions(client, voteId, labels) {
  for (let i = 0; i < labels.length; i++) {
    await client.query(
      "INSERT INTO options (vote_id, label, position) VALUES ($1, $2, $3)",
      [voteId, labels[i], i + 1]
    );
  }
}

// GET /api/votes -> [ { id, title, status, opens_at, closes_at } ]
router.get("/", adminOnly, async (req, res) => {
  const result = await query(
    `SELECT id, title, status, opens_at, closes_at
     FROM votes WHERE created_by = $1 ORDER BY created_at DESC, id DESC`,
    [req.user.id]
  );
  res.json(
    result.rows.map((vote) => ({
      id: vote.id,
      title: vote.title,
      status: effectiveStatus(vote),
      opens_at: vote.opens_at,
      closes_at: vote.closes_at,
    }))
  );
});

// POST /api/votes  { title, description, opens_at, closes_at, options } -> 201 { id }
// Creates a DRAFT.
router.post("/", adminOnly, async (req, res) => {
  const vote = validateVoteInput(req.body);

  const id = await withTransaction(async (client) => {
    const created = await client.query(
      `INSERT INTO votes (title, description, opens_at, closes_at, status, created_by)
       VALUES ($1, $2, $3, $4, 'draft', $5) RETURNING id`,
      [vote.title, vote.description, vote.opensAt, vote.closesAt, req.user.id]
    );
    await insertOptions(client, created.rows[0].id, vote.options);
    return created.rows[0].id;
  });

  res.status(201).json({ id });
});

// GET /api/votes/:id -> { id, title, description, opens_at, closes_at, status, options }
router.get("/:id", adminOnly, async (req, res) => {
  const vote = await findOwnVote(parseId(req.params.id, "Vote not found."), req.user.id);
  const options = await query(
    "SELECT id, label FROM options WHERE vote_id = $1 ORDER BY position",
    [vote.id]
  );
  res.json({
    id: vote.id,
    title: vote.title,
    description: vote.description,
    opens_at: vote.opens_at,
    closes_at: vote.closes_at,
    status: effectiveStatus(vote),
    options: options.rows,
  });
});

// PUT /api/votes/:id  (same body as POST) -> { message }   Draft votes only.
router.put("/:id", adminOnly, async (req, res) => {
  const vote = await findOwnVote(parseId(req.params.id, "Vote not found."), req.user.id);
  if (vote.status !== "draft") {
    throw new HttpError(409, "Only draft votes can be edited.");
  }
  const input = validateVoteInput(req.body);

  await withTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE votes SET title = $2, description = $3, opens_at = $4, closes_at = $5
       WHERE id = $1 AND status = 'draft'`,
      [vote.id, input.title, input.description, input.opensAt, input.closesAt]
    );
    if (updated.rowCount === 0) {
      throw new HttpError(409, "Only draft votes can be edited.");
    }
    // Replace the option list with the new one (a draft has no ballots yet).
    await client.query("DELETE FROM options WHERE vote_id = $1", [vote.id]);
    await insertOptions(client, vote.id, input.options);
  });

  res.json({ message: "Draft saved." });
});

// POST /api/votes/:id/publish -> { linkId }
// Creates the random link ID and locks the options.
router.post("/:id/publish", adminOnly, async (req, res) => {
  const vote = await findOwnVote(parseId(req.params.id, "Vote not found."), req.user.id);
  if (vote.status !== "draft") {
    throw new HttpError(409, "This vote has already been published.");
  }
  if (new Date(vote.closes_at) <= new Date()) {
    throw new HttpError(400, "The close time has already passed. Edit the draft and choose a later close time.");
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const updated = await query(
        "UPDATE votes SET status = 'open', link_id = $2 WHERE id = $1 AND status = 'draft' RETURNING link_id",
        [vote.id, newLinkId()]
      );
      if (updated.rowCount === 0) {
        throw new HttpError(409, "This vote has already been published.");
      }
      return res.json({ linkId: updated.rows[0].link_id });
    } catch (err) {
      if (err.code !== "23505") throw err; // 23505 = link ID already used (extremely unlikely): try again
    }
  }
  throw new Error("Could not create a unique link ID");
});

// POST /api/votes/:id/close -> { message }   Closes an open vote early.
router.post("/:id/close", adminOnly, async (req, res) => {
  const vote = await findOwnVote(parseId(req.params.id, "Vote not found."), req.user.id);
  const status = effectiveStatus(vote);
  if (status === "draft") {
    throw new HttpError(409, "A draft vote cannot be closed. Publish it first.");
  }
  if (status === "closed") {
    throw new HttpError(409, "This vote is already closed.");
  }
  await query("UPDATE votes SET status = 'closed' WHERE id = $1 AND status = 'open'", [vote.id]);
  res.json({ message: "Vote closed." });
});

// GET /api/votes/:id/link -> { linkId }
router.get("/:id/link", adminOnly, async (req, res) => {
  const vote = await findOwnVote(parseId(req.params.id, "Vote not found."), req.user.id);
  if (!vote.link_id) {
    throw new HttpError(409, "This vote has not been published yet.");
  }
  res.json({ linkId: vote.link_id });
});

// GET /api/votes/:id/turnout -> { count }   Only how many voted, never who or what.
router.get("/:id/turnout", adminOnly, async (req, res) => {
  const vote = await findOwnVote(parseId(req.params.id, "Vote not found."), req.user.id);
  const result = await query("SELECT COUNT(*)::int AS count FROM voted WHERE vote_id = $1", [vote.id]);
  res.json({ count: result.rows[0].count });
});

module.exports = router;
