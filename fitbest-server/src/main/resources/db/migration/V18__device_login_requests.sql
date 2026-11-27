CREATE TABLE device_login_requests (
    scan_id varchar(32) PRIMARY KEY,
    device_secret_hash varchar(64) NOT NULL,
    device_name varchar(120),
    verification_code varchar(6) NOT NULL,
    expires_at timestamptz NOT NULL,
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    status varchar(9) NOT NULL DEFAULT 'pending',
    CHECK (status IN ('pending', 'confirmed', 'redeemed', 'cancelled'))
);

CREATE INDEX device_login_requests_expiry_idx ON device_login_requests (expires_at);
