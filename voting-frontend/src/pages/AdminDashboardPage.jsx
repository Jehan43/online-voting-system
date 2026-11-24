import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  closeVote,
  getTurnout,
  getVoteLink,
  getVotes,
  publishVote,
} from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import Message from "../components/Message.jsx";

// The shareable link is built from this website's address plus the link ID.
function buildLink(linkId) {
  return window.location.origin + "/v/" + linkId;
}

function formatDate(isoString) {
  if (!isoString) return "-";
  return new Date(isoString).toLocaleString();
}

function AdminDashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logoutUser } = useAuth();

  const [votes, setVotes] = useState([]);
  const [turnout, setTurnout] = useState({}); // { voteId: number of votes cast }
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null); // vote that is being published/closed
  const [error, setError] = useState("");
  // A message can arrive from the vote form ("Draft saved").
  const [success, setSuccess] = useState(
    (location.state && location.state.message) || ""
  );

  async function loadVotes() {
    setError("");
    try {
      const list = await getVotes();
      setVotes(list);

      // Turnout is only available for votes that are no longer drafts.
      const entries = await Promise.all(
        list
          .filter((vote) => vote.status !== "draft")
          .map(async (vote) => {
            try {
              const data = await getTurnout(vote.id);
              return [vote.id, data.count];
            } catch (err) {
              return [vote.id, null];
            }
          })
      );
      setTurnout(Object.fromEntries(entries));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVotes();
    // Clear the saved message from the browser history so it is not shown again on refresh.
    if (location.state && location.state.message) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, []);

  function handleRefresh() {
    setLoading(true);
    setSuccess("");
    loadVotes();
  }

  async function handlePublish(vote) {
    const ok = window.confirm(
      'Publish "' + vote.title + '"?\n\nThe options will be locked and the voting link will be created.'
    );
    if (!ok) return;

    setError("");
    setSuccess("");
    setBusyId(vote.id);
    try {
      const data = await publishVote(vote.id);
      setSuccess("Published. Share this link with voters: " + buildLink(data.linkId));
      await loadVotes();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleClose(vote) {
    const ok = window.confirm(
      'Close "' + vote.title + '" now?\n\nNobody will be able to vote after this.'
    );
    if (!ok) return;

    setError("");
    setSuccess("");
    setBusyId(vote.id);
    try {
      await closeVote(vote.id);
      setSuccess('"' + vote.title + '" is now closed.');
      await loadVotes();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCopyLink(vote) {
    setError("");
    setSuccess("");
    setBusyId(vote.id);
    try {
      const data = await getVoteLink(vote.id);
      const link = buildLink(data.linkId);
      try {
        await navigator.clipboard.writeText(link);
        setSuccess("Link copied: " + link);
      } catch (err) {
        // Clipboard can be blocked by the browser; show the link so it can be copied by hand.
        setSuccess("Copy this link: " + link);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function handleLogout() {
    logoutUser();
    navigate("/login");
  }

  return (
    <div className="page page-wide">
      <div className="header-row">
        <h1>Admin dashboard</h1>
        <div className="button-row">
          <Link to="/admin/votes/new" className="btn btn-primary">
            Create vote
          </Link>
          <button type="button" className="btn" onClick={handleRefresh} disabled={loading}>
            Refresh
          </button>
          <button type="button" className="btn" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>

      <Message type="error">{error}</Message>
      <Message type="success">{success}</Message>

      {loading ? (
        <p className="loading">
          <span className="spinner"></span> Loading votes...
        </p>
      ) : votes.length === 0 ? (
        <p>No votes yet. Click "Create vote" to make your first one.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Opens</th>
                <th>Closes</th>
                <th>Votes cast</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {votes.map((vote) => (
                <tr key={vote.id}>
                  <td>{vote.title}</td>
                  <td>
                    <span className={"badge badge-" + vote.status}>{vote.status}</span>
                  </td>
                  <td>{formatDate(vote.opens_at)}</td>
                  <td>{formatDate(vote.closes_at)}</td>
                  <td>
                    {vote.status === "draft"
                      ? "-"
                      : turnout[vote.id] === null || turnout[vote.id] === undefined
                      ? "?"
                      : turnout[vote.id]}
                  </td>
                  <td>
                    <div className="button-row">
                      {vote.status === "draft" && (
                        <>
                          <Link to={"/admin/votes/" + vote.id + "/edit"} className="btn btn-small">
                            Edit
                          </Link>
                          <button
                            type="button"
                            className="btn btn-small btn-primary"
                            onClick={() => handlePublish(vote)}
                            disabled={busyId === vote.id}
                          >
                            Publish
                          </button>
                        </>
                      )}
                      {vote.status === "open" && (
                        <>
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => handleCopyLink(vote)}
                            disabled={busyId === vote.id}
                          >
                            Copy link
                          </button>
                          <button
                            type="button"
                            className="btn btn-small btn-danger"
                            onClick={() => handleClose(vote)}
                            disabled={busyId === vote.id}
                          >
                            Close early
                          </button>
                        </>
                      )}
                      {vote.status === "closed" && (
                        <Link to={"/results/" + vote.id} className="btn btn-small">
                          Results
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminDashboardPage;
