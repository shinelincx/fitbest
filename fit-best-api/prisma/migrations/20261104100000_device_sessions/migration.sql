-- CreateEnum
CREATE TYPE "DeviceKind" AS ENUM ('band', 'machine');

-- CreateEnum
CREATE TYPE "WorkoutMode" AS ENUM ('training', 'race');

-- CreateEnum
CREATE TYPE "SegmentType" AS ENUM ('start', 'finish', 'station', 'treadmill');

-- CreateEnum
CREATE TYPE "DeviceSessionQuality" AS ENUM ('ok', 'partial', 'invalid');

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "serial_no" TEXT NOT NULL,
    "kind" "DeviceKind" NOT NULL DEFAULT 'band',
    "label" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "client_session_id" TEXT NOT NULL,
    "mode" "WorkoutMode" NOT NULL,
    "app" TEXT NOT NULL DEFAULT 'hyrox',
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "duration_sec" INTEGER NOT NULL DEFAULT 0,
    "distance_m" INTEGER NOT NULL DEFAULT 0,
    "avg_hr" INTEGER,
    "max_hr" INTEGER,
    "metrics" JSONB,
    "close_reason" TEXT,
    "quality" "DeviceSessionQuality" NOT NULL DEFAULT 'ok',
    "training_record_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_segments" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" "SegmentType" NOT NULL,
    "machine_serial" TEXT,
    "machine_type" TEXT,
    "connect_tick" INTEGER,
    "disconnect_tick" INTEGER,
    "duration_sec" INTEGER NOT NULL DEFAULT 0,
    "distance_m" INTEGER NOT NULL DEFAULT 0,
    "metrics" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_serial_no_key" ON "devices"("serial_no");

-- CreateIndex
CREATE UNIQUE INDEX "device_sessions_user_id_client_session_id_key" ON "device_sessions"("user_id", "client_session_id");

-- CreateIndex
CREATE INDEX "device_sessions_user_id_started_at_idx" ON "device_sessions"("user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "device_sessions_device_id_started_at_idx" ON "device_sessions"("device_id", "started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "device_segments_session_id_seq_key" ON "device_segments"("session_id", "seq");

-- AddForeignKey
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_training_record_id_fkey" FOREIGN KEY ("training_record_id") REFERENCES "training_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_segments" ADD CONSTRAINT "device_segments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "device_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
