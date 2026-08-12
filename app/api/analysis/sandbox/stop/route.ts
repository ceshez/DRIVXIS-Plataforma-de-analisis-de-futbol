import { after, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAnalysisSandboxCallbackToken } from "@/lib/analysis-sandbox-callback";

const stopSandboxSchema = z.object({
  jobId: z.string().min(1).max(191),
  sandboxName: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  exitCode: z.number().int().optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = stopSandboxSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const claims = {
    jobId: parsed.data.jobId,
    sandboxName: parsed.data.sandboxName,
  };
  if (!token || !verifyAnalysisSandboxCallbackToken(token, claims)) {
    return NextResponse.json({ error: "Callback no autorizado." }, { status: 401 });
  }

  const { Sandbox } = await import("@vercel/sandbox");
  const sandbox = await Sandbox.get({ name: parsed.data.sandboxName, resume: false });
  after(async () => {
    try {
      await sandbox.stop();
      console.info(
        `DRIVXIS analysis Sandbox stopped: ${parsed.data.sandboxName} (job ${parsed.data.jobId}, exit ${parsed.data.exitCode ?? "unknown"})`,
      );
    } catch (error) {
      console.error(`DRIVXIS could not stop analysis Sandbox ${parsed.data.sandboxName}:`, error);
    }
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
