-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "request_hash" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_idempotency_key_key" ON "idempotency_records"("idempotency_key");

-- CreateIndex
CREATE INDEX "idempotency_records_request_hash_created_at_idx" ON "idempotency_records"("request_hash", "created_at");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");
