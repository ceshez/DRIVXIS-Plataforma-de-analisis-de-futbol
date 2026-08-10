DROP TABLE IF EXISTS "Player";
DROP TABLE IF EXISTS "TeamInvitation";
DROP TABLE IF EXISTS "TeamMember";
DROP TABLE IF EXISTS "Team";
DROP TYPE IF EXISTS "PlayerStatus";
DROP TYPE IF EXISTS "TeamMemberRole";

ALTER TABLE "User"
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'es',
  ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'dark',
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "PasswordResetCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PasswordResetCode_userId_createdAt_idx" ON "PasswordResetCode"("userId", "createdAt");
CREATE INDEX "PasswordResetCode_expiresAt_idx" ON "PasswordResetCode"("expiresAt");
ALTER TABLE "PasswordResetCode" ADD CONSTRAINT "PasswordResetCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
