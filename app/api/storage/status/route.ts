import { NextResponse } from "next/server";
import { getStorageConfigStatus, getStorageDebugStatus } from "@/lib/storage";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  await requireUser();

  const config = getStorageConfigStatus();
  const status = getStorageDebugStatus();
  const isR2Endpoint = Boolean(status.endpointHost?.includes("r2.cloudflarestorage.com"));

  return NextResponse.json({
    configured: status.configured,
    mode: status.configured && isR2Endpoint ? "r2" : "local",
    endpointHost: status.endpointHost,
    bucketName: status.bucketName,
    region: status.region,
    missing: config.errors,
    warnings: status.warnings,
  });
}
