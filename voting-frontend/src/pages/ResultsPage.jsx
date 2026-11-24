import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getResults } from "../api.js";
import { homePathFor, useAuth } from "../AuthContext.jsx";
import Message from "../components/Message.jsx";

// Vote counts per option. The backend only returns them after the vote has closed.
function ResultsPage() {
  const { voteId } = useParams();
  const { role } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notClosed, setNotClosed] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setData(await getResults(voteId));
      } catch (err) {
        setError(err.message);
        setNotClosed(err.status === 403);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [voteId]);

  return (
    <div className="page">
      <h1>{data ? "Results: " + data.title : "Results"}</h1>
      <p>
        <Link to={homePathFor(role)}>&larr; Back</Link>
      </p>

      {loading && (
        <p className="loading">
          <span className="spinner"></span> Loading results...
        </p>
      )}

      {notClosed && (
        <Message type="info">
          Results are hidden until voting closes. Please come back after the close time.
        </Message>
      )}
      {!notClosed && <Message type="error">{error}</Message>}

      {data && (
        <>
          <p>Total votes: {data.total}</p>
          {data.results.map((item) => {
            const percent = data.total > 0 ? (item.count / data.total) * 100 : 0;
            return (
              <div className="result-row" key={item.optionId}>
                <div className="result-label">
                  <span>{item.label}</span>
                  <span>
                    {item.count} ({percent.toFixed(1)}%)
                  </span>
                </div>
                <div className="bar">
                  <div className="bar-fill" style={{ width: percent + "%" }}></div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

export default ResultsPage;
