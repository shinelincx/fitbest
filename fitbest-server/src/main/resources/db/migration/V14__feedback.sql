CREATE TABLE feedback (
    id uuid PRIMARY KEY,
    source text NOT NULL CHECK (source IN ('fitbest', 'hyrox', 'btwe')),
    content text NOT NULL CHECK (char_length(content) BETWEEN 5 AND 2000),
    submitter_id uuid REFERENCES users(id) ON DELETE SET NULL,
    submission_scope text NOT NULL,
    idempotency_key uuid NOT NULL,
    request_hash text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved')),
    version bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (submission_scope, source, idempotency_key)
);

CREATE INDEX feedback_created_idx ON feedback (created_at DESC, id DESC);
CREATE INDEX feedback_filter_idx ON feedback (source, status, created_at DESC);

CREATE TABLE feedback_attachments (
    id uuid PRIMARY KEY,
    feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    position integer NOT NULL CHECK (position BETWEEN 0 AND 2),
    media_type text NOT NULL CHECK (media_type IN ('image/jpeg', 'image/png', 'image/webp')),
    content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 5242880),
    UNIQUE (feedback_id, position)
);

CREATE TABLE feedback_history (
    feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    version bigint NOT NULL,
    actor_id uuid NOT NULL,
    actor_name text NOT NULL,
    from_status text NOT NULL,
    to_status text NOT NULL,
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (feedback_id, version)
);
