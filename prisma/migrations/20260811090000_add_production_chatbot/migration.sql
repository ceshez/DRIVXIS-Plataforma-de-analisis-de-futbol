CREATE TYPE "ChatMode" AS ENUM ('GENERAL', 'TACTICAL', 'PHYSICAL');
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT');
CREATE TYPE "ChatMessageStatus" AS ENUM ('PENDING', 'STREAMING', 'COMPLETED', 'FAILED');
CREATE TYPE "ChatAttachmentStatus" AS ENUM ('READY', 'FAILED');

ALTER TABLE "Video"
  ADD COLUMN "playedAt" TIMESTAMP(3),
  ADD COLUMN "competition" TEXT;

CREATE TABLE "ChatThread" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'Nuevo chat',
  "mode" "ChatMode" NOT NULL DEFAULT 'TACTICAL',
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMessage" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "role" "ChatRole" NOT NULL,
  "status" "ChatMessageStatus" NOT NULL DEFAULT 'COMPLETED',
  "mode" "ChatMode" NOT NULL,
  "content" TEXT NOT NULL,
  "command" TEXT,
  "errorCode" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMessageVideo" (
  "messageId" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  CONSTRAINT "ChatMessageVideo_pkey" PRIMARY KEY ("messageId", "videoId")
);

CREATE TABLE "ChatAttachment" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "messageId" TEXT,
  "objectKey" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "status" "ChatAttachmentStatus" NOT NULL DEFAULT 'READY',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatAttachment_objectKey_key" ON "ChatAttachment"("objectKey");
CREATE INDEX "ChatThread_ownerId_lastMessageAt_idx" ON "ChatThread"("ownerId", "lastMessageAt");
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");
CREATE INDEX "ChatMessageVideo_videoId_idx" ON "ChatMessageVideo"("videoId");
CREATE INDEX "ChatAttachment_ownerId_createdAt_idx" ON "ChatAttachment"("ownerId", "createdAt");
CREATE INDEX "ChatAttachment_threadId_createdAt_idx" ON "ChatAttachment"("threadId", "createdAt");
CREATE INDEX "ChatAttachment_messageId_idx" ON "ChatAttachment"("messageId");

ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageVideo" ADD CONSTRAINT "ChatMessageVideo_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageVideo" ADD CONSTRAINT "ChatMessageVideo_videoId_fkey"
  FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
