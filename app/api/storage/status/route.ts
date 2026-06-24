import { NextResponse } from "next/server";
import { getStorageConfigStatus, getStorageDebugStatus } from "@/lib/storage";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();

  const config = getStorageConfigStatus();
  const status = getStorageDebugStatus();
  const isR2Endpoint = Boolean(status.endpointHost?.includes("r2.cloudflarestorage.com"));
  const mode = status.configured && isR2Endpoint ? "r2" : "local";

  if (process.env.NODE_ENV === "production" && user.role !== "ADMIN") {
    return NextResponse.json({
      configured: status.configured,
      mode,
    });
  }

  return NextResponse.json({
    configured: status.configured,
    mode,
    endpointHost: status.endpointHost,
    bucketName: status.bucketName,
    region: status.region,
    missing: config.errors,
    warnings: status.warnings,
  });
}
