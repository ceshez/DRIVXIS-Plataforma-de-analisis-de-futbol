import { NextResponse } from "next/server";
import { getStorageDebugStatus } from "@/lib/storage";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  await requireUser();

  const status = getStorageDebugStatus();
  return NextResponse.json({
    configured: status.configured,
    endpointHost: status.endpointHost,
    bucketName: status.bucketName,
    region: status.region,
    hasAccessKey: status.hasAccessKey,
    hasSecretKey: status.hasSecretKey,
    warnings: status.warnings,
  });
}
