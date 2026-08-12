import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_CALLBACK_TTL_MS = 50 * 60 * 1000;
const MINIMUM_SECRET_LENGTH = 32;

type AnalysisSandboxCallbackClaims = {
  jobId: string;
  sandboxName: string;
};

type CallbackTokenOptions = {
  secret?: string;
  nowMs?: number;
  ttlMs?: number;
};

type SignedAnalysisSandboxCallbackClaims = AnalysisSandboxCallbackClaims & {
  expiresAt: number;
  version: 1;
};

export function createAnalysisSandboxCallbackToken(
  claims: AnalysisSandboxCallbackClaims,
  options: CallbackTokenOptions = {},
) {
  const secret = getCallbackSecret(options.secret);
  const nowMs = options.nowMs ?? Date.now();
  const payload: SignedAnalysisSandboxCallbackClaims = {
    ...claims,
    expiresAt: nowMs + (options.ttlMs ?? DEFAULT_CALLBACK_TTL_MS),
    version: 1,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signCallbackPayload(encoded, secret)}`;
}

export function verifyAnalysisSandboxCallbackToken(
  token: string,
  expectedClaims: AnalysisSandboxCallbackClaims,
  options: CallbackTokenOptions = {},
) {
  try {
    const secret = getCallbackSecret(options.secret);
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra) return false;

    const receivedSignature = Buffer.from(signature, "base64url");
    const expectedSignature = Buffer.from(signCallbackPayload(encoded, secret), "base64url");
    if (
      receivedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(receivedSignature, expectedSignature)
    ) {
      return false;
    }

    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<SignedAnalysisSandboxCallbackClaims>;
    return (
      payload.version === 1 &&
      payload.jobId === expectedClaims.jobId &&
      payload.sandboxName === expectedClaims.sandboxName &&
      typeof payload.expiresAt === "number" &&
      payload.expiresAt >= (options.nowMs ?? Date.now())
    );
  } catch {
    return false;
  }
}

function getCallbackSecret(explicitSecret?: string) {
  const secret = explicitSecret ?? process.env.ANALYSIS_SANDBOX_CALLBACK_SECRET?.trim();
  if (!secret || secret.length < MINIMUM_SECRET_LENGTH) {
    throw new Error(
      `ANALYSIS_SANDBOX_CALLBACK_SECRET must contain at least ${MINIMUM_SECRET_LENGTH} characters.`,
    );
  }
  return secret;
}

function signCallbackPayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
