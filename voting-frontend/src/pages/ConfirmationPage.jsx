import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { getCastStatus } from "../api.js";
import Message from "../components/Message.jsx";

const POLL_EVERY_MS = 2000; // check every 2 seconds
const GIVE_UP_AFTER_MS = 120000; // stop waiting after 2 minutes

// Shown after a vote is submitted. Votes are saved through a queue, so this page
// checks the status every 2 seconds until the receipt code is ready (or it fails).
function ConfirmationPage() {
  const { requestId } = useParams();
  const location = useLocation();
  const voteId = location.state && location.state.voteId;

  const [status, setStatus] = useState("pending"); // "pending", "done" or "failed"
  const [receiptCode, setReceiptCode] = useState("");
  const [failMessage, setFailMessage] = useState("");
  const [warning, setWarning] = useState(""); // temporary problem while checking
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0); // increases when the user clicks "Check again"
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const startedAt = Date.now();
    setTimedOut(false);

    async function check() {
      try {
        const data = await getCastStatus(requestId);
        if (cancelled) return;
        setWarning("");

        if (data.status === "done") {
          setReceiptCode(data.receiptCode);
          setStatus("done");
          return; // finished: do not poll again
        }
        if (data.status === "failed") {
          setFailMessage(data.message || "Your vote could not be saved.");
          setStatus("failed");
          return; // finished: do not poll again
        }
      } catch (err) {
        if (cancelled) return;
        setWarning(err.message);
        if (err.status === 404) {
          return; // this request does not exist, so polling again is pointless
        }
      }

      if (Date.now() - startedAt > GIVE_UP_AFTER_MS) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(check, POLL_EVERY_MS);
    }

    check();

    // Stop polling when the user leaves the page.
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [requestId, attempt]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(receiptCode);
      setCopyMessage("Copied.");
    } catch (err) {
      setCopyMessage("Could not copy. Please select the code and copy it by hand.");
    }
  }

  if (status === "done") {
    return (
      <div className="page">
        <h1>Vote recorded</h1>
        <Message type="success">Your vote was saved. Thank you for voting.</Message>
        <p>Your receipt code:</p>
        <div className="receipt-box">{receiptCode}</div>
        <div className="button-row">
          <button type="button" className="btn" onClick={handleCopy}>
            Copy code
          </button>
          <Link to="/receipt" state={{ code: receiptCode }} className="btn btn-primary">
            Verify receipt
          </Link>
          {voteId && (
            <Link to={"/results/" + voteId} className="btn">
              Results
            </Link>
          )}
        </div>
        <Message type="info">{copyMessage}</Message>
        <p className="hint">
          Keep this code. It lets you check later that your vote was counted. It does
          not show who you voted for. Results are available after voting closes.
        </p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="page">
        <h1>Vote not saved</h1>
        <Message type="error">{failMessage}</Message>
        <p className="hint">
          If you think this is a mistake, go to your voting link again to see whether
          your vote was counted.
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Saving your vote</h1>
      {timedOut ? (
        <>
          <Message type="info">
            This is taking longer than usual. Your vote may still be processing.
          </Message>
          <button type="button" className="btn" onClick={() => setAttempt(attempt + 1)}>
            Check again
          </button>
        </>
      ) : (
        <p className="loading">
          <span className="spinner"></span> Please wait. Do not close this page.
        </p>
      )}
      <Message type="error">{warning}</Message>
    </div>
  );
}

export default ConfirmationPage;
