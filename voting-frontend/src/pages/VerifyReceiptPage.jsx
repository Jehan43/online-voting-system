import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { checkReceipt } from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import Message from "../components/Message.jsx";

// Voter home page: check that a receipt code exists (so the vote was counted).
function VerifyReceiptPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logoutUser } = useAuth();

  // The confirmation page can pass the code in so the voter does not retype it.
  const [code, setCode] = useState((location.state && location.state.code) || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const cleanCode = code.trim();
    if (!cleanCode) {
      setError("Enter your receipt code.");
      return;
    }

    setLoading(true);
    try {
      const data = await checkReceipt(cleanCode);
      if (data && data.valid) {
        setSuccess("This receipt is valid. Your vote was counted.");
      } else {
        setError("This receipt code was not recognised.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    logoutUser();
    navigate("/login");
  }

  return (
    <div className="page">
      <div className="header-row">
        <h1>Verify receipt</h1>
        <button type="button" className="btn" onClick={handleLogout}>
          Log out
        </button>
      </div>
      <p>
        Enter the receipt code you received after voting to confirm your vote was
        counted. To vote, open the voting link shared by your election admin.
      </p>

      <Message type="error">{error}</Message>
      <Message type="success">{success}</Message>

      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="code">Receipt code</label>
          <input
            id="code"
            type="text"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Checking..." : "Verify receipt"}
        </button>
      </form>
    </div>
  );
}

export default VerifyReceiptPage;
