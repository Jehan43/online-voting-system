import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { login, verifyLoginOtp } from "../api.js";
import { homePathFor, useAuth } from "../AuthContext.jsx";
import Message from "../components/Message.jsx";
import OtpForm from "../components/OtpForm.jsx";

// Login has two steps: (1) email + password, (2) the OTP emailed to the user.
function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();

  const state = location.state || {};
  const from = state.from; // page the user wanted before being sent to login

  const [step, setStep] = useState("password"); // "password" or "otp"
  const [email, setEmail] = useState(state.email || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notVerified, setNotVerified] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setError("");
    setNotVerified(false);

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
      setStep("otp");
    } catch (err) {
      setError(err.message);
      // 403 = the account exists but the signup email code was never entered.
      setNotVerified(err.status === 403);
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpVerify(otp) {
    const data = await verifyLoginOtp(email.trim(), otp);
    if (!data || !data.token || !data.role) {
      throw new Error("Unexpected response from the server. Please try again.");
    }
    auth.loginUser(data.token, data.role);

    // Admins go to the dashboard. Voters go back to the page they wanted
    // (for example a shared voting link), or to their home page.
    let target = homePathFor(data.role);
    if (data.role === "admin" && from && from.startsWith("/admin")) {
      target = from;
    }
    if (data.role === "voter" && from && !from.startsWith("/admin")) {
      target = from;
    }
    navigate(target, { replace: true });
  }

  if (step === "otp") {
    return (
      <div className="page">
        <h1>Enter your login code</h1>
        <OtpForm
          email={email.trim()}
          purpose="login"
          onVerify={handleOtpVerify}
          buttonText="Log in"
        />
        <p>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setStep("password");
              setPassword("");
            }}
          >
            Use a different account
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Log in</h1>

      {auth.sessionExpired && (
        <Message type="info">Your session expired. Please log in again.</Message>
      )}
      {state.verified && (
        <Message type="success">Email verified. You can now log in.</Message>
      )}
      <Message type="error">{error}</Message>
      {notVerified && (
        <p>
          <Link to="/verify-otp" state={{ email: email.trim(), from: from }}>
            Enter your email verification code
          </Link>
        </p>
      )}

      <form onSubmit={handlePasswordSubmit} noValidate>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Checking..." : "Continue"}
        </button>
      </form>

      <p>
        New here? <Link to="/signup" state={{ from: from }}>Create an account</Link>
      </p>
    </div>
  );
}

export default LoginPage;
