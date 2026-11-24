// An error that carries an HTTP status code.
// Throw it anywhere in a route: the error handler in app.js turns it into
//   { "message": "..." }   (plus any extra fields, for example { voteId })
class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || {};
  }
}

module.exports = { HttpError };
