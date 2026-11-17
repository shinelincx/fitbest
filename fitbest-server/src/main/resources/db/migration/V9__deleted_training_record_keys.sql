CREATE TABLE "deleted_training_record_keys" (
    "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "app" TEXT NOT NULL,
    "client_key" TEXT NOT NULL,
    PRIMARY KEY ("user_id", "app", "client_key")
);

CREATE INDEX "training_records_user_app_created_id_idx"
    ON "training_records" ("user_id", "app", "created_at" DESC, "id" DESC);
