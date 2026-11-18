ALTER TABLE admin_users
    ADD COLUMN session_version bigint NOT NULL DEFAULT 0,
    ADD COLUMN setup_hash text,
    ADD COLUMN setup_expires_at timestamp(3),
    ADD COLUMN site_editor boolean NOT NULL DEFAULT false,
    ADD COLUMN site_publisher boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX admin_users_setup_hash_key ON admin_users(setup_hash) WHERE setup_hash IS NOT NULL;
CREATE INDEX admin_users_org_id_idx ON admin_users(org_id);
