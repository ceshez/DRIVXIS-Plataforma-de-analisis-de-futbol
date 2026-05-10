import { NextResponse } from "next/server";
import { checkStorageConnectivity } from "@/lib/storage";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  await requireUser();

  const result = await checkStorageConnectivity();
  if (result.ok) {
    return NextResponse.json({ ok: true, message: result.message });
  }

  return NextResponse.json({
    ok: false,
    message: result.message,
    errorName: result.errorName,
    errorCode: result.errorCode,
    httpStatusCode: "httpStatusCode" in result ? result.httpStatusCode : null,
    details: "details" in result ? result.details : null,
  });
}
