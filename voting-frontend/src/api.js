// All communication with the backend lives in this one file.
// Pages call the functions below and never use fetch() directly.
// Every path here is documented in API_CONTRACT.md.

// Read the base URL from public/config.js (see that file). Falls back to "/api".
const API_BASE_URL =
  (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || "/api";

// The login token is kept here, in memory only.
// It is never saved to localStorage, so refreshing the page logs the user out.
let token = null;

// AuthContext registers a function here that logs the user out on a 401.
let onUnauthorized = null;

export function setToken(newToken) {
  token = newToken;
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

// Error thrown for every failed request.
//   error.message -> text that is safe to show to the user
//   error.status  -> HTTP status code (0 means the server could not be reached)
//   error.data    -> full JSON body of the error (e.g. error.data.voteId)
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// Sends one request and returns the parsed JSON on success.
async function request(method, path, body) {
  const headers = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }

  let response;
  try {
    response = await fetch(API_BASE_URL + path, {
      method: method,
      headers: headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError(
      "Cannot reach the server. Check your connection and try again.",
      0,
      null
    );
  }

  // Try to read the JSON body (it may be empty).
  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    data = null;
  }

  if (!response.ok) {
    // An expired or invalid token: send the user back to the login page.
    // (Only when we actually had a token, so a wrong password at login is not affected.)
    if (response.status === 401 && token && onUnauthorized) {
      onUnauthorized();
    }
    const message =
      (data && data.message) || "Something went wrong (error " + response.status + ").";
    throw new ApiError(message, response.status, data);
  }

  return data;
}

// Makes a value safe to put inside a URL path.
function enc(value) {
  return encodeURIComponent(value);
}

// ---------- Auth ----------

// POST /auth/signup -> { message }
export function signup(email, password) {
  return request("POST", "/auth/signup", { email, password });
}

// POST /auth/verify-otp -> { message }   (signup OTP)
export function verifySignupOtp(email, otp) {
  return request("POST", "/auth/verify-otp", { email, otp });
}

// POST /auth/login -> { message }   (password OK, OTP emailed)
export function login(email, password) {
  return request("POST", "/auth/login", { email, password });
}

// POST /auth/login/verify-otp -> { token, role }   (login OTP)
export function verifyLoginOtp(email, otp) {
  return request("POST", "/auth/login/verify-otp", { email, otp });
}

// POST /auth/resend-otp -> { message }
// purpose is "signup" or "login"
export function resendOtp(email, purpose) {
  return request("POST", "/auth/resend-otp", { email, purpose });
}

// ---------- Admin ----------

// GET /votes -> [{ id, title, status, opens_at, closes_at }]
export function getVotes() {
  return request("GET", "/votes");
}

// GET /votes/:id -> { id, title, description, opens_at, closes_at, status, options: [{ id, label }] }
export function getVote(id) {
  return request("GET", "/votes/" + enc(id));
}

// POST /votes -> { id }
// vote = { title, description, opens_at, closes_at, options: ["A", "B"] }
export function createVote(vote) {
  return request("POST", "/votes", vote);
}

// PUT /votes/:id -> { message }   (draft votes only)
export function updateVote(id, vote) {
  return request("PUT", "/votes/" + enc(id), vote);
}

// POST /votes/:id/publish -> { linkId }
export function publishVote(id) {
  return request("POST", "/votes/" + enc(id) + "/publish");
}

// POST /votes/:id/close -> { message }
export function closeVote(id) {
  return request("POST", "/votes/" + enc(id) + "/close");
}

// GET /votes/:id/link -> { linkId }
export function getVoteLink(id) {
  return request("GET", "/votes/" + enc(id) + "/link");
}

// GET /votes/:id/turnout -> { count }
export function getTurnout(id) {
  return request("GET", "/votes/" + enc(id) + "/turnout");
}

// ---------- Voter ----------

// GET /v/:linkId -> { id, title, description, status: "open", opens_at, closes_at, options: [{ id, label }] }
// Errors: 403 not open yet, 410 closed (data.voteId), 409 already voted (data.voteId), 404 bad link
export function getVoteByLink(linkId) {
  return request("GET", "/v/" + enc(linkId));
}

// POST /v/:linkId/cast -> { requestId }   (HTTP 202)
export function castVote(linkId, optionId) {
  return request("POST", "/v/" + enc(linkId) + "/cast", { optionId });
}

// GET /cast/:requestId -> { status: "pending" | "done" | "failed", receiptCode?, message? }
export function getCastStatus(requestId) {
  return request("GET", "/cast/" + enc(requestId));
}

// GET /receipt/:code -> { valid: true }   (404 if the code does not exist)
export function checkReceipt(code) {
  return request("GET", "/receipt/" + enc(code));
}

// GET /votes/:id/results -> { title, total, results: [{ optionId, label, count }] }
// 403 until the vote has closed.
export function getResults(voteId) {
  return request("GET", "/votes/" + enc(voteId) + "/results");
}
