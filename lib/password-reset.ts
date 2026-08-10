import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { sendPasswordResetEmail } from "@/lib/email";
import { hashPassword } from "@/lib/password";
import { normalizeLocale } from "@/lib/preferences";
import { prisma } from "@/lib/prisma";

const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;
const MAX_RESET_ATTEMPTS = 5;

function getResetSecret() {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) throw new Error("Missing NEXTAUTH_SECRET or AUTH_SECRET environment variable.");
  return secret;
}

export function hashPasswordResetCode(userId: string, code: string) {
  return createHmac("sha256", getResetSecret()).update(`${userId}:${code}`).digest("hex");
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, locale: true },
  });
  if (!user) return {};

  return issuePasswordResetCode(user, "recovery");
}

export async function requestPasswordChange(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, locale: true },
  });
  if (!user) return {};

  return issuePasswordResetCode(user, "authenticated-change");
}

async function issuePasswordResetCode(
  user: { id: string; email: string; name: string; locale: string },
  purpose: "recovery" | "authenticated-change",
) {

  const recentCode = await prisma.passwordResetCode.findFirst({
    where: { userId: user.id, usedAt: null },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recentCode && recentCode.createdAt.getTime() > Date.now() - RESET_REQUEST_COOLDOWN_MS) return {};

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();
  const resetCode = await prisma.$transaction(async (tx) => {
    await tx.passwordResetCode.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });
    return tx.passwordResetCode.create({
      data: {
        userId: user.id,
        codeHash: hashPasswordResetCode(user.id, code),
        expiresAt: new Date(now.getTime() + RESET_CODE_TTL_MS),
      },
      select: { id: true },
    });
  });

  const delivery = await sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    code,
    locale: normalizeLocale(user.locale),
    purpose,
    idempotencyKey: `password-reset/${resetCode.id}`,
  });

  if (process.env.NODE_ENV !== "production" && !delivery.sent) {
    return { developmentCode: code };
  }
  return {};
}

export async function resetPasswordWithCode(input: { email: string; code: string; newPassword: string }) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (!user) return false;

  const resetCode = await prisma.passwordResetCode.findFirst({
    where: { userId: user.id, usedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, codeHash: true, attempts: true, expiresAt: true },
  });
  if (!resetCode || resetCode.expiresAt.getTime() <= Date.now() || resetCode.attempts >= MAX_RESET_ATTEMPTS) {
    return false;
  }

  const submittedHash = Buffer.from(hashPasswordResetCode(user.id, input.code), "hex");
  const storedHash = Buffer.from(resetCode.codeHash, "hex");
  const valid = submittedHash.length === storedHash.length && timingSafeEqual(submittedHash, storedHash);

  if (!valid) {
    const finalAttempt = resetCode.attempts + 1 >= MAX_RESET_ATTEMPTS;
    await prisma.passwordResetCode.updateMany({
      where: { id: resetCode.id, usedAt: null },
      data: {
        attempts: { increment: 1 },
        ...(finalAttempt ? { usedAt: new Date() } : {}),
      },
    });
    return false;
  }

  const passwordHash = await hashPassword(input.newPassword);
  const usedAt = new Date();
  return prisma.$transaction(async (tx) => {
    const consumed = await tx.passwordResetCode.updateMany({
      where: { id: resetCode.id, usedAt: null, attempts: { lt: MAX_RESET_ATTEMPTS } },
      data: { usedAt },
    });
    if (consumed.count !== 1) return false;

    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    await tx.passwordResetCode.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt },
    });
    return true;
  });
}
