import { spawn } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";
import { parseAnalysisMetrics } from "@/lib/analysis-metrics";
import { createMatchReportData, createMatchReportFilename } from "@/lib/match-report";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

const MAX_REPORT_PDF_BYTES = 5 * 1024 * 1024;

export async function POST(_request: Request, context: RouteContext) {
  const [user, { id }] = await Promise.all([requireUser(), context.params]);
  const video = await prisma.video.findFirst({
    where: { id, ownerId: user.id },
    select: {
      originalFilename: true,
      status: true,
      metadata: true,
      metricSnapshots: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { metrics: true },
      },
    },
  });

  if (!video) {
    return NextResponse.json({ error: "Video no encontrado." }, { status: 404 });
  }

  const metrics = parseAnalysisMetrics(video.metricSnapshots[0]?.metrics);
  if (video.status !== "COMPLETED" || !metrics) {
    return NextResponse.json({ error: "El reporte estará disponible cuando termine el análisis." }, { status: 409 });
  }

  const matchInfo = getMatchInfo(video.metadata);
  const report = createMatchReportData({
    metrics,
    originalFilename: video.originalFilename,
    matchInfo,
  });
  let pdf: Buffer;
  try {
    pdf = await createReportPdf(report);
  } catch (error) {
    console.error("DRIVXIS report PDF generation failed:", error);
    return NextResponse.json({ error: "No se pudo generar el PDF del reporte. Inténtalo de nuevo." }, { status: 500 });
  }
  const filename = createMatchReportFilename(video.originalFilename, "pdf");

  const body = new Uint8Array(pdf.byteLength);
  body.set(pdf);

  return new NextResponse(body.buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": `attachment; filename=\"reporte-partido.pdf\"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

function createReportPdf(report: ReturnType<typeof createMatchReportData>) {
  const root = process.cwd();
  const pythonBin = process.env.PYTHON_BIN || "python";
  const scriptPath = path.join(root, "scripts", "generate-match-report-pdf.py");
  const logoPath = path.join(root, "public", "logos", "drivxis-logo-claro.ico");
  const payload = JSON.stringify({ report, logoPath });

  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(pythonBin, [scriptPath], { cwd: root, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    let outputSize = 0;

    child.stdout.on("data", (chunk: Buffer) => {
      outputSize += chunk.length;
      if (outputSize > MAX_REPORT_PDF_BYTES) {
        child.kill();
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (outputSize > MAX_REPORT_PDF_BYTES) {
        reject(new Error("Generated PDF exceeded the maximum size."));
        return;
      }
      if (code !== 0) {
        reject(new Error(stderr.trim() || `PDF generator exited with code ${code}.`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
    child.stdin.end(payload);
  });
}

function getMatchInfo(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const matchInfo = (metadata as Record<string, unknown>).matchInfo;
  return matchInfo && typeof matchInfo === "object" && !Array.isArray(matchInfo) ? matchInfo : undefined;
}
