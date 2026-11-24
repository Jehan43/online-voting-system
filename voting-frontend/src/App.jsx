import { Link, Navigate, Route, Routes } from "react-router-dom";
import { homePathFor, useAuth } from "./AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import VerifyOtpPage from "./pages/VerifyOtpPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import AdminDashboardPage from "./pages/AdminDashboardPage.jsx";
import VoteFormPage from "./pages/VoteFormPage.jsx";
import VotingPage from "./pages/VotingPage.jsx";
import ConfirmationPage from "./pages/ConfirmationPage.jsx";
import VerifyReceiptPage from "./pages/VerifyReceiptPage.jsx";
import ResultsPage from "./pages/ResultsPage.jsx";

// "/" sends each user to the right place for their role.
function Home() {
  const { isLoggedIn, role } = useAuth();
  return <Navigate to={isLoggedIn ? homePathFor(role) : "/login"} replace />;
}

function NotFound() {
  return (
    <div className="page">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Go to the home page</Link>
      </p>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />

      {/* Public pages */}
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/verify-otp" element={<VerifyOtpPage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Admin pages */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute role="admin">
            <AdminDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/votes/new"
        element={
          <ProtectedRoute role="admin">
            <VoteFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/votes/:id/edit"
        element={
          <ProtectedRoute role="admin">
            <VoteFormPage />
          </ProtectedRoute>
        }
      />

      {/* Voter pages */}
      <Route
        path="/v/:linkId"
        element={
          <ProtectedRoute role="voter">
            <VotingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/confirmation/:requestId"
        element={
          <ProtectedRoute role="voter">
            <ConfirmationPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/receipt"
        element={
          <ProtectedRoute role="voter">
            <VerifyReceiptPage />
          </ProtectedRoute>
        }
      />

      {/* Results: any logged-in user (the backend hides them until the vote closes) */}
      <Route
        path="/results/:voteId"
        element={
          <ProtectedRoute>
            <ResultsPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
