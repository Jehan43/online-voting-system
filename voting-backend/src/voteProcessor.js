// Saves one queued vote. Used by the SQS worker and by the local (no-queue) mode.
//
// ONE database transaction (design document):
//   1. insert into "voted"   (who voted; the PRIMARY KEY blocks a second vote)
//   2. insert into "ballots" (what was voted; no user column; has the receipt code)
// If step 1 finds the voter already in the table, nothing is saved and the
// request is marked "failed" so the voter sees "already voted".
const { query, withTransaction } = require("./db");
const { newReceiptCode } = require("./voteHelpers");

// job = { requestId, voteId, userId, optionId }
async function processVoteJob(job) {
  try {
    await withTransaction(async (client) => {
      // Lock this request row. SQS can deliver a message twice, so skip it if already handled.
      const request = await client.query(
        "SELECT status FROM cast_requests WHERE request_id = $1 FOR UPDATE",
        [job.requestId]
      );
      if (request.rowCount === 0 || request.rows[0].status !== "pending") {
        return;
      }

      // Step 1: mark the voter as "voted".
      const voted = await client.query(
        "INSERT INTO voted (vote_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [job.voteId, job.userId]
      );
      if (voted.rowCount === 0) {
        await client.query(
          "UPDATE cast_requests SET status = 'failed', message = $2 WHERE request_id = $1",
          [job.requestId, "You have already voted."]
        );
        return;
      }

      // Step 2: store the anonymous ballot with a random receipt code.
      let receiptCode = null;
      for (let attempt = 0; attempt < 5 && receiptCode === null; attempt++) {
        const code = newReceiptCode();
        const ballot = await client.query(
          `INSERT INTO ballots (vote_id, option_id, receipt_code)
           VALUES ($1, $2, $3)
           ON CONFLICT (receipt_code) DO NOTHING`,
          [job.voteId, job.optionId, code]
        );
        if (ballot.rowCount === 1) {
          receiptCode = code;
        }
      }
      if (receiptCode === null) {
        throw new Error("Could not create a unique receipt code");
      }

      await client.query(
        "UPDATE cast_requests SET status = 'done', receipt_code = $2 WHERE request_id = $1",
        [job.requestId, receiptCode]
      );
    });
  } catch (err) {
    // 23503 = foreign key error (the option does not belong to this vote). Retrying cannot help.
    if (err.code === "23503") {
      await query(
        "UPDATE cast_requests SET status = 'failed', message = $2 WHERE request_id = $1 AND status = 'pending'",
        [job.requestId, "That option is not valid for this vote."]
      );
      return;
    }
    // Anything else (for example the database is down) is thrown so the message is tried again.
    throw err;
  }
}

module.exports = { processVoteJob };
