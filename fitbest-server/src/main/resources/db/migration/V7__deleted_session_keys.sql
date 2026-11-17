CREATE TABLE "deleted_session_keys" (
    "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "client_key" TEXT NOT NULL,
    PRIMARY KEY ("user_id", "client_key")
);
