// Vote queue.
//   QUEUE_MODE=sqs   -> votes go to an SQS FIFO queue; a worker loop saves them.
//   QUEUE_MODE=local -> no AWS needed: the vote is saved right away inside this process.
const config = require("./config");
const { processVoteJob } = require("./voteProcessor");

let sqsClient = null;
let stopping = false;

function getSqs() {
  if (!sqsClient) {
    const { SQSClient } = require("@aws-sdk/client-sqs");
    sqsClient = new SQSClient({ region: config.awsRegion });
  }
  return sqsClient;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Called by POST /v/:linkId/cast. job = { requestId, voteId, userId, optionId }
async function sendVoteJob(job) {
  if (config.queueMode === "sqs") {
    const { SendMessageCommand } = require("@aws-sdk/client-sqs");
    await getSqs().send(
      new SendMessageCommand({
        QueueUrl: config.sqsQueueUrl,
        MessageBody: JSON.stringify(job),
        // Messages with the same group ID are handled in order, one at a time.
        MessageGroupId: job.voteId + "-" + job.userId,
        // A different ID for every request, so SQS never silently drops one.
        MessageDeduplicationId: job.requestId,
      })
    );
    return;
  }

  // Local mode: process after the HTTP response has been sent.
  setImmediate(() => {
    processVoteJob(job).catch((err) => {
      console.error("Local vote processing failed:", err.message);
    });
  });
}

// Reads messages from SQS and saves the votes. Runs forever (until stopWorker).
async function startWorker() {
  if (config.queueMode !== "sqs" || !config.runWorker) {
    return;
  }
  const { ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
  console.log("Vote worker started (SQS).");

  while (!stopping) {
    try {
      const response = await getSqs().send(
        new ReceiveMessageCommand({
          QueueUrl: config.sqsQueueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20, // long polling
        })
      );

      for (const message of response.Messages || []) {
        let job = null;
        try {
          job = JSON.parse(message.Body);
        } catch (err) {
          console.error("Deleting a message that is not valid JSON.");
        }

        try {
          if (job) {
            await processVoteJob(job);
          }
          // Delete only after the vote is safely saved (or recognised as a failed/duplicate request).
          await getSqs().send(
            new DeleteMessageCommand({
              QueueUrl: config.sqsQueueUrl,
              ReceiptHandle: message.ReceiptHandle,
            })
          );
        } catch (err) {
          // Not deleted: SQS will deliver the message again after the visibility timeout.
          console.error("Vote job failed, it will be retried:", err.message);
        }
      }
    } catch (err) {
      console.error("Worker error:", err.message);
      await sleep(5000);
    }
  }
}

function stopWorker() {
  stopping = true;
}

module.exports = { sendVoteJob, startWorker, stopWorker };
