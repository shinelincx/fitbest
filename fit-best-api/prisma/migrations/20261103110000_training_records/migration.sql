-- CreateTable
CREATE TABLE "training_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "app" TEXT NOT NULL,
    "plan_id" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "total_time_sec" INTEGER NOT NULL,
    "distance_m" INTEGER NOT NULL DEFAULT 0,
    "module_times" JSONB,
    "run_splits" JSONB,
    "avg_hr" INTEGER,
    "max_hr" INTEGER,
    "rpe" INTEGER,
    "weakest_station" TEXT,
    "started_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_records_user_id_app_created_at_idx" ON "training_records"("user_id", "app", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
