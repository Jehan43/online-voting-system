import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { verifySignupOtp } from "../api.js";
import OtpForm from "../components/OtpForm.jsx";

// Step 2 of signup: enter the code that was emailed after signing up.
function VerifyOtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state && location.state.email;
  const from = location.state && location.state.from;

  // This page needs the email from the signup page.
  if (!email) {
    return <Navigate to="/signup" replace />;
  }

  async function handleVerify(otp) {
    await verifySignupOtp(email, otp);
    navigate("/login", {
      replace: true,
      state: { email: email, from: from, verified: true },
    });
  }

  return (
    <div className="page">
      <h1>Verify your email</h1>
      <OtpForm
        email={email}
        purpose="signup"
        onVerify={handleVerify}
        buttonText="Verify email"
      />
      <p>
        Wrong email? <Link to="/signup" state={{ from: from }}>Start again</Link>
      </p>
    </div>
  );
}

export default VerifyOtpPage;
