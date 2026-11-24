import { createContext, useContext, useEffect, useState } from "react";
import { setToken, setUnauthorizedHandler } from "./api.js";

// Holds the logged-in user's role for the whole app.
// The token itself is stored in memory inside api.js (never in localStorage),
// so refreshing the browser logs the user out.

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [role, setRole] = useState(null); // "admin", "voter" or null (logged out)
  const [sessionExpired, setSessionExpired] = useState(false);

  // Called after a successful login OTP check.
  function loginUser(token, userRole) {
    setToken(token);
    setRole(userRole);
    setSessionExpired(false);
  }

  function logoutUser() {
    setToken(null);
    setRole(null);
  }

  // If the backend ever answers 401 (token expired), log out and tell the user.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setRole(null);
      setSessionExpired(true);
    });
  }, []);

  const value = {
    role,
    isLoggedIn: role !== null,
    sessionExpired,
    loginUser,
    logoutUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The first page each role sees after logging in.
// Admins start at the dashboard. Voters start at the receipt page
// (they reach a vote through the link the admin shares with them).
export function homePathFor(role) {
  return role === "admin" ? "/admin" : "/receipt";
}

export function useAuth() {
  return useContext(AuthContext);
}
