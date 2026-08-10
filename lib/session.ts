import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

type SessionPayload = {
  userId: string;
  email: string;
  role: "USER" | "ADMIN";
  sessionVersion?: number;
  exp: number;
};

function getSessionCookieName() {
  const cookieName = process.env.SESSION_COOKIE;

  if (!cookieName) {
    throw new Error("Missing SESSION_COOKIE environment variable.");
  }

  return cookieName;
}

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error("Missing NEXTAUTH_SECRET or AUTH_SECRET environment variable.");
  }

  return secret;
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payload: string) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function createSessionToken(payload: Omit<SessionPayload, "exp">) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
  const encoded = base64Url(JSON.stringify({ ...payload, exp }));
  return `${encoded}.${signPayload(encoded)}`;
}

function verifySessionToken(token: string): SessionPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = signPayload(encoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: Omit<SessionPayload, "exp">) {
  const cookieStore = await cookies();
  cookieStore.set(getSessionCookieName(), createSessionToken(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(getSessionCookieName());
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  try {
    return await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        locale: true,
        theme: true,
        sessionVersion: true,
        createdAt: true,
        updatedAt: true,
        avatarObjectKey: true,
        avatarMimeType: true,
      },
    }).then((user) => {
      if (!user || user.sessionVersion !== (payload.sessionVersion ?? 0)) return null;
      return user;
    });
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
