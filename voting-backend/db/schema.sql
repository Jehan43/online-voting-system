-- Online Voting System: PostgreSQL schema (PostgreSQL 13 or newer).
-- Safe to run more than once (uses IF NOT EXISTS).

-- ---------------------------------------------------------------
-- users: one row per account. Email is unique (case-insensitive).
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id               SERIAL PRIMARY KEY,
  email            VARCHAR(254) NOT NULL,
  password_hash    TEXT NOT NULL,
  role             VARCHAR(10) NOT NULL DEFAULT 'voter'
                   CHECK (role IN ('admin', 'voter')),
  is_verified      BOOLEAN NOT NULL DEFAULT FALSE,
  failed_attempts  INTEGER NOT NULL DEFAULT 0,
  locked_until     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (LOWER(email));

-- ---------------------------------------------------------------
-- otp_codes: one active code per user (a new code replaces the old one).
-- The code itself is never stored, only a keyed hash.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_codes (
  user_id            INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  purpose            VARCHAR(10) NOT NULL CHECK (purpose IN ('signup', 'login')),
  code_hash          TEXT NOT NULL,
  expires_at         TIMESTAMPTZ NOT NULL,
  attempts           INTEGER NOT NULL DEFAULT 0,
  last_sent_at       TIMESTAMPTZ NOT NULL,   -- for the 30 second resend cooldown
  window_started_at  TIMESTAMPTZ NOT NULL,   -- start of the current hour window
  send_count         INTEGER NOT NULL DEFAULT 1  -- codes sent in that window (max 5)
);

-- ---------------------------------------------------------------
-- votes: link_id stays NULL until the admin publishes the vote.
-- status: draft -> open -> closed
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS votes (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(200) NOT NULL,
  description  TEXT NOT NULL,
  link_id      VARCHAR(40) UNIQUE,
  opens_at     TIMESTAMPTZ NOT NULL,
  closes_at    TIMESTAMPTZ NOT NULL,
  status       VARCHAR(10) NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'open', 'closed')),
  created_by   INTEGER NOT NULL REFERENCES users (id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (closes_at > opens_at),
  CHECK (status = 'draft' OR link_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS votes_created_by_idx ON votes (created_by);

-- ---------------------------------------------------------------
-- options: a label cannot repeat within a vote (case-insensitive).
-- position keeps the order the admin chose.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS options (
  id        SERIAL PRIMARY KEY,
  vote_id   INTEGER NOT NULL REFERENCES votes (id) ON DELETE CASCADE,
  label     VARCHAR(200) NOT NULL,
  position  INTEGER NOT NULL,
  UNIQUE (id, vote_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS options_vote_label_unique ON options (vote_id, LOWER(label));

-- ---------------------------------------------------------------
-- voted: WHO has voted. The primary key means a second vote from
-- the same user in the same vote always fails.
-- No option column and no timestamp, so it says nothing about the choice.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voted (
  vote_id  INTEGER NOT NULL REFERENCES votes (id),
  user_id  INTEGER NOT NULL REFERENCES users (id),
  PRIMARY KEY (vote_id, user_id)
);

-- ---------------------------------------------------------------
-- ballots: WHAT was voted. No user column and no timestamp, so a ballot
-- cannot be traced to a person. The id is random (not a counter) so the
-- order of votes is not visible either.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ballots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id       INTEGER NOT NULL,
  option_id     INTEGER NOT NULL,
  receipt_code  VARCHAR(20) NOT NULL UNIQUE,
  -- the option must belong to the same vote
  FOREIGN KEY (option_id, vote_id) REFERENCES options (id, vote_id)
);
CREATE INDEX IF NOT EXISTS ballots_vote_option_idx ON ballots (vote_id, option_id);

-- ---------------------------------------------------------------
-- cast_requests: lets the browser check whether a queued vote has been
-- saved yet. It deliberately has NO user column and NO option column,
-- so it cannot link a person to a ballot. Old rows are deleted after 1 hour.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cast_requests (
  request_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id       INTEGER NOT NULL REFERENCES votes (id),
  status        VARCHAR(10) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'done', 'failed')),
  receipt_code  VARCHAR(20),
  message       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cast_requests_vote_status_idx ON cast_requests (vote_id, status);
