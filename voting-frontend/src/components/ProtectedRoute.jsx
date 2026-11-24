import { Link, Navigate, useLocation } from "react-router-dom";
import { homePathFor, useAuth } from "../AuthContext.jsx";
import Message from "./Message.jsx";

// Wrap a page in this to protect it.
//   <ProtectedRoute>                -> any logged-in user
//   <ProtectedRoute role="admin">   -> admins only
// The backend checks the role again on every request.
function ProtectedRoute({ role, children }) {
  const auth = useAuth();
  const location = useLocation();

  // Not logged in: go to login and remember where the user wanted to go
  // (this is how a shared voting link works for people who are not logged in).
  if (!auth.isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Logged in with the wrong role.
  if (role && auth.role !== role) {
    return (
      <div className="page">
        <h1>Wrong account type</h1>
        <Message type="error">
          This page is only for {role} accounts. You are logged in as a {auth.role}.
        </Message>
        <p>
          <Link to={homePathFor(auth.role)}>Go to my home page</Link>
        </p>
      </div>
    );
  }

  return children;
}

export default ProtectedRoute;
