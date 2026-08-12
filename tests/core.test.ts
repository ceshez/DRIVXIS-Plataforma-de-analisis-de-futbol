import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getDetectedColorPair, isAllowedDetectedColorSwap } from "@/lib/detected-color-pair";
import { ANALYSIS_CANCELLED_BY_USER, isAnalysisCancelled } from "@/lib/analysis-cancellation";
import { parseAnalysisMetrics } from "@/lib/analysis-metrics";
import { getAnalysisJobTarget, getAnalysisWorkerMode, shouldAutoStartAnalysisWorker } from "@/lib/analysis-worker";
import { buildMatchReport, createMatchReportData, createMatchReportFilename } from "@/lib/match-report";
import { pickLocale } from "@/lib/i18n";
import { normalizeLocale, normalizeTheme, translate } from "@/lib/preferences";
import { getAnalysisOutputDirectory, getLocalObjectPath, isManagedAnalysisPath, isManagedLocalUploadPath } from "@/lib/local-storage";
import { createVideoObjectKey } from "@/lib/storage";
import {
  changePasswordSchema,
  createVideoSchema,
  forgotPasswordSchema,
  loginSchema,
  presignVideoSchema,
  registerSchema,
  resetPasswordSchema,
  updatePreferencesSchema,
  updateProfileSchema,
} from "@/lib/validators";
import { parseVideoListQuery } from "@/lib/video-list";
import { serializeVideo } from "@/lib/video-serialization";
import { getVideoEventRetryDelay, isVideoEventTerminal } from "@/lib/video-event-stream";
import { isTransientUploadError } from "../scripts/analysis-upload-retry.mjs";

describe("analysis worker placement", () => {
  it("auto-starts local YOLO with opt-in but keeps LocateAnything on Linux GPU workers", () => {
    expect(shouldAutoStartAnalysisWorker({ autoStart: "true", platform: "win32", detector: "yolo" })).toBe(true);
    expect(shouldAutoStartAnalysisWorker({ autoStart: "", platform: "linux", detector: "yolo" })).toBe(false);
    expect(shouldAutoStartAnalysisWorker({ autoStart: "true", platform: "win32", detector: "locateanything" })).toBe(false);
    expect(shouldAutoStartAnalysisWorker({ autoStart: "true", platform: "linux", detector: "locateanything" })).toBe(true);
  });

  it("selects Vercel Sandbox only when analysis auto-start is enabled", () => {
    expect(getAnalysisWorkerMode({ autoStart: "true", mode: "vercel-sandbox", detector: "yolo" })).toBe(
      "vercel-sandbox",
    );
    expect(getAnalysisWorkerMode({ autoStart: "false", mode: "vercel-sandbox", detector: "yolo" })).toBe(
      "disabled",
    );
    expect(getAnalysisWorkerMode({ autoStart: "true", mode: "unknown", detector: "yolo" })).toBe("disabled");
  });

  it("targets the exact queued job that requested a Sandbox", () => {
    expect(getAnalysisJobTarget("  job-123  ")).toEqual({ jobId: "job-123", where: { id: "job-123" } });
    expect(getAnalysisJobTarget()).toEqual({ jobId: null, where: {} });
  });
});

describe("analysis output upload retry", () => {
  it("retries recoverable TLS record failures from an R2 streaming PUT", () => {
    expect(
      isTransientUploadError(
        new Error(
          "SSL routines:ssl3_read_bytes:ssl/tls alert bad record mac:openssl/ssl/record/rec_layer_s3.c:918:SSL alert number 20",
        ),
      ),
    ).toBe(true);
    expect(isTransientUploadError({ code: "ERR_SSL_BAD_RECORD_MAC" })).toBe(true);
    expect(isTransientUploadError(new Error("SignatureDoesNotMatch"))).toBe(false);
  });
});

describe("analysis cancellation", () => {
  it("serializes user cancellations without changing the persisted status enum", () => {
    const video = serializeVideo({
      id: "video_123",
      originalFilename: "match.mp4",
      status: "UPLOADED",
      sizeBytes: 1024n,
      createdAt: new Date("2026-08-07T00:00:00Z"),
      analysisJobs: [
        {
          id: "job_123",
          status: "FAILED",
          progress: 37,
          error: ANALYSIS_CANCELLED_BY_USER,
          createdAt: new Date("2026-08-07T00:00:01Z"),
          endedAt: new Date("2026-08-07T00:00:02Z"),
        },
      ],
    });

    expect(isAnalysisCancelled(ANALYSIS_CANCELLED_BY_USER)).toBe(true);
    expect(isAnalysisCancelled("CUDA out of memory")).toBe(false);
    expect(video.latestJob?.cancelled).toBe(true);
    expect(video.latestJob?.progress).toBe(37);
  });

  it("stops the Python child and protects cancelled jobs from failure writeback", () => {
    const worker = readFileSync(join(process.cwd(), "scripts", "analysis-worker.mjs"), "utf8");

    expect(worker).toContain('child.kill("SIGTERM")');
    expect(worker).toContain('child.kill("SIGKILL")');
    expect(worker).toContain('where: { id: job.id, status: "RUNNING" }');
    expect(worker).toContain("error instanceof AnalysisCancelledError");
  });
});

describe("video event stream resilience", () => {
  it("keeps queued jobs open but closes completed or failed jobs", () => {
    expect(isVideoEventTerminal({ status: "PENDING_ANALYSIS", latestJob: { status: "QUEUED" } })).toBe(false);
    expect(isVideoEventTerminal({ status: "PROCESSING", latestJob: { status: "RUNNING" } })).toBe(false);
    expect(isVideoEventTerminal({ status: "UPLOADED", latestJob: { status: "FAILED" } })).toBe(true);
    expect(isVideoEventTerminal({ status: "COMPLETED", latestJob: null })).toBe(true);
  });

  it("backs off transient database failures without retrying indefinitely at full speed", () => {
    expect(getVideoEventRetryDelay(1)).toBe(2_000);
    expect(getVideoEventRetryDelay(2)).toBe(4_000);
    expect(getVideoEventRetryDelay(3)).toBe(8_000);
    expect(getVideoEventRetryDelay(20)).toBe(15_000);
  });

  it("catches stream read failures and lets EventSource reconnect transport errors", () => {
    const route = readFileSync(join(process.cwd(), "app", "api", "videos", "[id]", "events", "route.ts"), "utf8");
    const subscription = readFileSync(join(process.cwd(), "components", "video-event-subscription.tsx"), "utf8");

    expect(route).toContain("consecutiveFailures += 1");
    expect(route).toContain("VIDEO_EVENT_MAX_CONSECUTIVE_FAILURES");
    expect(subscription).toContain("eventSource.readyState === EventSource.CLOSED");
    expect(subscription).toContain('addEventListener("video-error"');
  });
});

describe("i18n locale detection", () => {
  it("uses the first browser language as the target locale", () => {
    expect(pickLocale("en-US,en;q=0.9,es;q=0.8")).toBe("en");
    expect(pickLocale("pt-BR,es;q=0.8")).toBe("pt");
  });

  it("falls back to Spanish when no browser language exists", () => {
    expect(pickLocale(null)).toBe("es");
    expect(pickLocale("")).toBe("es");
  });
});

describe("account preferences", () => {
  it("limits persisted preferences to supported languages and themes", () => {
    expect(normalizeLocale("en-US")).toBe("es");
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("system")).toBe("dark");
    expect(updatePreferencesSchema.safeParse({ locale: "en", theme: "light" }).success).toBe(true);
    expect(updatePreferencesSchema.safeParse({ locale: "fr" }).success).toBe(false);
    expect(translate("en", "settings")).toBe("Settings");
  });
});

describe("video history query", () => {
  it("parses search, advanced filters, sorting, and page size", () => {
    const query = parseVideoListQuery(new URLSearchParams({
      q: "final",
      status: "COMPLETED",
      dateFrom: "2026-01-01",
      dateTo: "2026-08-09",
      minSizeMb: "50",
      maxSizeMb: "500",
      sort: "name-asc",
      page: "3",
      limit: "25",
    }));

    expect(query).toMatchObject({
      q: "final",
      status: "COMPLETED",
      page: 3,
      limit: 25,
      sort: "name-asc",
      minSizeMb: 50,
      maxSizeMb: 500,
    });
  });

  it("falls back to safe pagination defaults for invalid query values", () => {
    expect(parseVideoListQuery(new URLSearchParams({ page: "0", limit: "500" }))).toMatchObject({
      page: 1,
      limit: 10,
      sort: "newest",
    });
  });
});

describe("video storage keys", () => {
  it("scopes uploaded videos to the authenticated user", () => {
    const key = createVideoObjectKey({
      userId: "user_123",
      filename: "Partido final jornada 12.mp4",
      mimeType: "video/mp4",
    });

    expect(key).toMatch(/^users\/user_123\/videos\//);
    expect(key).toContain("Partido-final-jornada-12.mp4");
  });

  it("keeps local storage paths inside the configured upload root", () => {
    const key = createVideoObjectKey({
      userId: "user_123",
      filename: "match.mp4",
      mimeType: "video/mp4",
    });

    expect(getLocalObjectPath(key)).toContain(".drivxis");
    expect(() => getLocalObjectPath("users/user_123/videos/../secret.mp4")).toThrow();
  });

  it("recognizes managed upload and analysis paths", () => {
    const key = createVideoObjectKey({
      userId: "user_123",
      filename: "match.mp4",
      mimeType: "video/mp4",
    });
    const uploadPath = getLocalObjectPath(key);
    const analysisPath = getAnalysisOutputDirectory("video_123");

    expect(isManagedLocalUploadPath(uploadPath)).toBe(true);
    expect(isManagedLocalUploadPath("C:/temp/outside.mp4")).toBe(false);
    expect(isManagedAnalysisPath(analysisPath)).toBe(true);
    expect(isManagedAnalysisPath("C:/temp/outside-analysis")).toBe(false);
  });
});

describe("request validation", () => {
  it("requires strong registration basics", () => {
    expect(
      registerSchema.safeParse({ name: "Ca", email: "coach@club.com", password: "12345678" }).success,
    ).toBe(true);
    expect(registerSchema.safeParse({ name: "C", email: "bad", password: "short" }).success).toBe(false);
  });

  it("validates video uploads by mime type and size", () => {
    expect(
      presignVideoSchema.safeParse({
        filename: "match.mp4",
        mimeType: "video/mp4",
        sizeBytes: 1024,
      }).success,
    ).toBe(true);
    expect(
      presignVideoSchema.safeParse({
        filename: "notes.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
      }).success,
    ).toBe(false);
  });

  it("accepts local and s3 upload modes when registering metadata", () => {
    expect(
      createVideoSchema.safeParse({
        filename: "match.mp4",
        mimeType: "video/mp4",
        sizeBytes: 1024,
        objectKey: "users/user_123/videos/2026-04-29/demo-match.mp4",
        uploadMode: "local",
      }).success,
    ).toBe(true);
    expect(
      createVideoSchema.safeParse({
        filename: "match.mp4",
        mimeType: "video/mp4",
        sizeBytes: 1024,
        objectKey: "users/user_123/videos/2026-04-29/demo-match.mp4",
        uploadMode: "ftp",
      }).success,
    ).toBe(false);
  });

  it("accepts login credentials shape", () => {
    expect(loginSchema.safeParse({ email: "analyst@club.com", password: "secret" }).success).toBe(true);
  });

  it("validates profile and password recovery requests", () => {
    expect(updateProfileSchema.safeParse({ name: "Carlos", email: "carlos@club.com" }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ action: "request", newPassword: "new-password" }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ action: "confirm", code: "123456", newPassword: "new-password" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "carlos@club.com" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ email: "carlos@club.com", code: "123456", newPassword: "new-password" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ email: "carlos@club.com", code: "12", newPassword: "short" }).success).toBe(false);
  });
});

describe("analysis metrics contract", () => {
  it("parses the v1 model output used by dashboard stats", () => {
    const metrics = parseAnalysisMetrics({
      version: 1,
      inference: {
        detector: "yolo",
        model: "nvidia/LocateAnything-3B",
        revision: "c32291ca5e996f5a7a485845b4f57a233936bba0",
        generationMode: "hybrid",
        format: "onnx",
        device: "cpu",
        detectionFps: 5,
        batchSize: 4,
        analysisSize: { width: 1920, height: 1080 },
        framesProcessed: 250,
        slowRetries: 2,
        parseFailures: 0,
      },
      possession: { team1Pct: 57.2, team2Pct: 42.8, unknownPct: 0 },
      ballControl: { ownTeam: 57.2, rivalTeam: 42.8, unknown: 0 },
      speed: {
        maxKmh: 0,
        avgKmh: 0,
        rawMaxKmh: 31.4,
        publishable: false,
        players: [],
      },
      distance: {
        totalMeters: 101420,
        teams: {
          own: { name: "Equipo propio", totalMeters: 12800, totalKm: 12.8 },
          rival: { name: "Equipo rival", totalMeters: 11600, totalKm: 11.6 },
        },
      },
      teamDistances: { ownTeam: 12800, rivalTeam: 11600 },
      quality: {
        goalkeepers: {
          detected: 2,
          assigned: 2,
          items: [{ id: 99, team: 1, teamConfidence: 0.82, reason: "goal_side_context", frames: 40 }],
        },
      },
      video: { frameCount: 1200, fps: 24, durationSeconds: 50, annotatedAvailable: true },
    });

    expect(metrics?.possession.team1Pct).toBe(57.2);
    expect(metrics?.ballControl?.ownTeam).toBe(57.2);
    expect(metrics?.speed.players).toHaveLength(0);
    expect(metrics?.speed.publishable).toBe(false);
    expect(metrics?.distance.teams?.own.totalKm).toBe(12.8);
    expect(metrics?.teamDistances?.rivalTeam).toBe(11600);
    expect(metrics?.quality?.goalkeepers?.items?.[0]?.team).toBe(1);
    expect(metrics?.video.annotatedAvailable).toBe(true);
    expect(metrics?.inference?.model).toBe("nvidia/LocateAnything-3B");
    expect(metrics?.inference?.detector).toBe("yolo");
    expect(metrics?.inference?.format).toBe("onnx");
    expect(metrics?.inference?.analysisSize?.width).toBe(1920);
  });

  it("rejects unknown metric versions", () => {
    expect(parseAnalysisMetrics({ version: 2 })).toBeNull();
  });

  it("allows only detected team colors in normal or swapped order", () => {
    const detected = getDetectedColorPair({
      version: 1,
      match: { detectedTeamColors: { team1: "#ffffff", team2: "#00aa44" } },
    });

    expect(isAllowedDetectedColorSwap({ ownTeamColor: "#ffffff", rivalTeamColor: "#00aa44" }, detected)).toBe(true);
    expect(isAllowedDetectedColorSwap({ ownTeamColor: "#00aa44", rivalTeamColor: "#ffffff" }, detected)).toBe(true);
    expect(isAllowedDetectedColorSwap({ ownTeamColor: "#123456", rivalTeamColor: "#ffffff" }, detected)).toBe(false);
  });
});

describe("match analysis report", () => {
  it("uses match team names in the report even when color confirmation is pending", () => {
    const metrics = parseAnalysisMetrics({
      version: 1,
      match: {
        ownTeam: "Club Azul",
        rivalTeam: "Club Rojo",
        detectedTeamColors: { team1: "#112233", team2: "#aabbcc" },
      },
      possession: { team1Pct: 62, team2Pct: 38 },
      speed: { maxKmh: 0, avgKmh: 0, validSamples: 0, rejectedSamples: 0, players: [] },
      distance: { totalMeters: 24000, teams: { own: { name: "Club Azul", totalMeters: 12800, totalKm: 12.8 }, rival: { name: "Club Rojo", totalMeters: 11200, totalKm: 11.2 } } },
      video: { frameCount: 1200, fps: 24, durationSeconds: 50, annotatedAvailable: true },
    });

    const report = createMatchReportData({ metrics: metrics!, originalFilename: "match.mp4" });

    expect(report.teamMapping.confirmed).toBe(false);
    expect(report.statTeams.primary).toBe("Club Azul");
    expect(report.statTeams.secondary).toBe("Club Rojo");
    expect(report.insights.some((insight) => insight.includes("Club Azul"))).toBe(true);
  });

  it("builds a written report from the completed analysis metrics", () => {
    const metrics = parseAnalysisMetrics({
      version: 1,
      match: {
        ownTeam: "Club Azul",
        rivalTeam: "Club Rojo",
        detectedTeamColors: { team1: "#112233", team2: "#aabbcc" },
      },
      possession: { team1Pct: 62, team2Pct: 38 },
      ballControl: { ownTeam: 62, rivalTeam: 38 },
      speed: { maxKmh: 31, avgKmh: 18.5, publishable: true, validSamples: 10, rejectedSamples: 0, players: [] },
      distance: {
        totalMeters: 24000,
        teams: {
          own: { name: "Club Azul", totalMeters: 12800, totalKm: 12.8 },
          rival: { name: "Club Rojo", totalMeters: 11200, totalKm: 11.2 },
        },
      },
      players: { detected: 18 },
      video: { frameCount: 1200, fps: 24, durationSeconds: 125, annotatedAvailable: true },
    });

    expect(metrics).not.toBeNull();
    const report = buildMatchReport({
      metrics: metrics!,
      originalFilename: "Final jornada 12.mp4",
      matchInfo: { ownTeamColor: "#112233", rivalTeamColor: "#aabbcc" },
      generatedAt: new Date("2026-06-23T12:00:00Z"),
    });

    expect(report).toContain("Partido: Club Azul vs Club Rojo");
    expect(report).toContain("Club Azul 62,0%");
    expect(report).not.toContain("Jugadores detectados");
    expect(createMatchReportFilename("Final/jornada 12.mp4", "pdf")).toBe("Final-jornada 12-reporte-de-analisis.pdf");
  });
});

describe("match color editor", () => {
  it("does not expose manual color picker inputs", () => {
    const source = readFileSync(join(process.cwd(), "components", "match-color-editor.tsx"), "utf8");
    expect(source).not.toContain('type="color"');
    expect(source).toContain("ArrowLeftRight");
  });
});

describe("profile password settings", () => {
  it("keeps the form reference across the async password confirmation", () => {
    const source = readFileSync(join(process.cwd(), "components", "profile-settings.tsx"), "utf8");

    expect(source).toContain("const formElement = event.currentTarget;");
    expect(source).toContain('type={showPassword ? "text" : "password"}');
    expect(source).toContain("formElement.reset()");
  });
});
