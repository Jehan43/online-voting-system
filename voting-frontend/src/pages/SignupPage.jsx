import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { signup } from "../api.js";
import Message from "../components/Message.jsx";

function SignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // If the user came from a shared voting link, remember it for after login.
  const from = location.state && location.state.from;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Live password checks (the backend checks them again, plus a common-password list).
  const emailName = email.split("@")[0].toLowerCase();
  const rules = [
    { text: "At least 8 characters", ok: password.length >= 8 },
    { text: "One uppercase letter", ok: /[A-Z]/.test(password) },
    { text: "One lowercase letter", ok: /[a-z]/.test(password) },
    { text: "One number", ok: /[0-9]/.test(password) },
    { text: "One symbol (for example ! @ # $)", ok: /[^A-Za-z0-9]/.test(password) },
    {
      text: "Does not contain your email name",
      ok: password.length > 0 && !(emailName.length >= 3 && password.toLowerCase().includes(emailName)),
    },
  ];
  const passwordsMatch = password === confirmPassword;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (!rules.every((rule) => rule.ok)) {
      setError("Your password does not meet all the rules below.");
      return;
    }
    if (!passwordsMatch) {
      setError("The two passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = email.trim();
      await signup(cleanEmail, password);
      navigate("/verify-otp", { state: { email: cleanEmail, from: from } });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <h1>Create an account</h1>
      <Message type="error">{error}</Message>

      <form onSubmit={handleSubmit} noValidate>
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <ul className="rules">
            {rules.map((rule) => (
              <li key={rule.text} className={rule.ok ? "rule-ok" : "rule-bad"}>
                {rule.ok ? "✓" : "✗"} {rule.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="field">
          <label htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {confirmPassword && !passwordsMatch && (
            <p className="field-error">Passwords do not match.</p>
          )}
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Creating account..." : "Sign up"}
        </button>
      </form>

      <p>
        Already have an account? <Link to="/login" state={{ from: from }}>Log in</Link>
      </p>
    </div>
  );
}

export default SignupPage;
