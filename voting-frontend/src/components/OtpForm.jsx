import { useEffect, useState } from "react";
import { resendOtp } from "../api.js";
import Message from "./Message.jsx";

const COOLDOWN_SECONDS = 30;

// Six-digit code entry with a resend button (30 second cooldown).
// Used for both the signup OTP and the login OTP.
//
// Props:
//   email      - where the code was sent
//   purpose    - "signup" or "login" (tells the backend which OTP to resend)
//   onVerify   - async function(otp). Should throw an error if the code is wrong.
//   buttonText - text of the submit button
function OtpForm({ email, purpose, onVerify, buttonText }) {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  // A code was just sent, so the resend button starts on cooldown.
  const [secondsLeft, setSecondsLeft] = useState(COOLDOWN_SECONDS);

  // Count the cooldown down once per second.
  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }
    const timer = setTimeout(() => setSecondsLeft(secondsLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  function handleChange(e) {
    // Keep digits only, maximum 6.
    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    setVerifying(true);
    try {
      await onVerify(otp);
      // On success the parent page moves on to another page.
    } catch (err) {
      setError(err.message);
      setVerifying(false);
    }
  }

  async function handleResend() {
    setError("");
    setInfo("");
    setResending(true);
    try {
      await resendOtp(email, purpose);
      setInfo("A new code was sent. The old code no longer works.");
      setOtp("");
      setSecondsLeft(COOLDOWN_SECONDS);
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <p>
        We sent a 6-digit code to <strong>{email}</strong>. It is valid for 5 minutes
        and allows 3 wrong attempts. Check your spam folder if you cannot find it.
      </p>

      <Message type="error">{error}</Message>
      <Message type="success">{info}</Message>

      <div className="field">
        <label htmlFor="otp">6-digit code</label>
        <input
          id="otp"
          className="otp-input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={otp}
          onChange={handleChange}
          placeholder="000000"
          maxLength={6}
        />
      </div>

      <div className="button-row">
        <button type="submit" className="btn btn-primary" disabled={verifying}>
          {verifying ? "Checking..." : buttonText}
        </button>
        <button
          type="button"
          className="btn"
          onClick={handleResend}
          disabled={secondsLeft > 0 || resending || verifying}
        >
          {resending
            ? "Sending..."
            : secondsLeft > 0
            ? "Resend code in " + secondsLeft + "s"
            : "Resend code"}
        </button>
      </div>
    </form>
  );
}

export default OtpForm;
