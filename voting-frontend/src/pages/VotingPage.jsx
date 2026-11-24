import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { castVote, getVoteByLink } from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import Message from "../components/Message.jsx";

function formatDate(isoString) {
  return isoString ? new Date(isoString).toLocaleString() : "-";
}

// Opened from the shared link: /v/:linkId
// Flow: pick an option -> review screen -> confirm -> confirmation page (receipt).
function VotingPage() {
  const { linkId } = useParams();
  const navigate = useNavigate();
  const { logoutUser } = useAuth();

  const [vote, setVote] = useState(null);
  const [loading, setLoading] = useState(true);
  // Set when the vote cannot be used: not open yet, closed, already voted, bad link.
  const [blocked, setBlocked] = useState(null);
  const [stage, setStage] = useState("select"); // "select" or "review"
  const [selectedId, setSelectedId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await getVoteByLink(linkId);
        setVote(data);
      } catch (err) {
        setBlocked(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [linkId]);

  function handleLogout() {
    logoutUser();
    navigate("/login");
  }

  async function handleConfirm() {
    setError("");
    setSubmitting(true);
    try {
      const data = await castVote(linkId, selectedId);
      if (!data || !data.requestId) {
        throw new Error("Unexpected response from the server. Please try again.");
      }
      // "replace" so the Back button cannot return here and cast again.
      navigate("/confirmation/" + data.requestId, {
        replace: true,
        state: { voteId: vote.id },
      });
    } catch (err) {
      // These statuses mean the vote cannot be used any more: show the full message screen.
      if ([403, 404, 409, 410].includes(err.status)) {
        setBlocked(err);
      } else {
        setError(err.message);
        setSubmitting(false);
      }
    }
  }

  if (loading) {
    return (
      <div className="page">
        <p className="loading">
          <span className="spinner"></span> Loading vote...
        </p>
      </div>
    );
  }

  // ----- vote cannot be used -----
  if (blocked) {
    const voteId = blocked.data && blocked.data.voteId;
    let heading = "Something went wrong";
    if (blocked.status === 403) heading = "Voting has not opened yet";
    if (blocked.status === 410) heading = "Voting is closed";
    if (blocked.status === 409) heading = "You have already voted";
    if (blocked.status === 404) heading = "Voting link not found";

    return (
      <div className="page">
        <h1>{heading}</h1>
        <Message type={blocked.status === 409 ? "info" : "error"}>{blocked.message}</Message>
        <div className="button-row">
          {voteId && (
            <Link to={"/results/" + voteId} className="btn">
              View results
            </Link>
          )}
          {blocked.status === 409 && (
            <Link to="/receipt" className="btn">
              Verify my receipt
            </Link>
          )}
          <button type="button" className="btn" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>
    );
  }

  const selected = vote.options.find((option) => option.id === selectedId);

  // ----- review screen -----
  if (stage === "review") {
    return (
      <div className="page">
        <h1>Review your vote</h1>
        <p>
          <strong>{vote.title}</strong>
        </p>
        <p>
          You selected: <strong>{selected.label}</strong>
        </p>
        <Message type="info">You cannot change your vote after you confirm.</Message>
        <Message type="error">{error}</Message>
        <div className="button-row">
          <button
            type="button"
            className="btn"
            onClick={() => setStage("select")}
            disabled={submitting}
          >
            Go back
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Confirm vote"}
          </button>
        </div>
      </div>
    );
  }

  // ----- select an option -----
  return (
    <div className="page">
      <div className="header-row">
        <h1>{vote.title}</h1>
        <button type="button" className="btn" onClick={handleLogout}>
          Log out
        </button>
      </div>
      <p>{vote.description}</p>
      <p className="hint">Voting closes: {formatDate(vote.closes_at)}</p>

      <fieldset className="choices">
        <legend>Choose one option</legend>
        {vote.options.map((option) => (
          <label className="choice" key={option.id}>
            <input
              type="radio"
              name="option"
              checked={selectedId === option.id}
              onChange={() => setSelectedId(option.id)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        className="btn btn-primary"
        disabled={selectedId === null}
        onClick={() => setStage("review")}
      >
        Continue
      </button>
    </div>
  );
}

export default VotingPage;
