-- AlterTable
ALTER TABLE "training_records" ADD COLUMN "client_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "training_records_user_id_app_client_key_key" ON "training_records"("user_id", "app", "client_key");
