-- CreateTable
CREATE TABLE "google_drive_credentials" (
    "id" VARCHAR NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "provider_account_id" VARCHAR NOT NULL,
    "email" VARCHAR,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "scope" TEXT,
    "status" VARCHAR NOT NULL DEFAULT 'active',
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "google_drive_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_drive_credentials_user_id_key" ON "google_drive_credentials"("user_id");

-- CreateIndex
CREATE INDEX "google_drive_credentials_provider_account_id_idx" ON "google_drive_credentials"("provider_account_id");

-- AddForeignKey
ALTER TABLE "google_drive_credentials" ADD CONSTRAINT "google_drive_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
