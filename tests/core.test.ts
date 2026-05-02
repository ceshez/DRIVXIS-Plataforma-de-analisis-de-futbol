import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getDetectedColorPair, isAllowedDetectedColorSwap } from "@/lib/detected-color-pair";
import { parseAnalysisMetrics } from "@/lib/analysis-metrics";
import { pickLocale } from "@/lib/i18n";
import { getAnalysisOutputDirectory, getLocalObjectPath, isManagedAnalysisPath, isManagedLocalUploadPath } from "@/lib/local-storage";
import { createVideoObjectKey } from "@/lib/storage";
import { createVideoSchema, loginSchema, presignVideoSchema, registerSchema } from "@/lib/validators";

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
});

describe("analysis metrics contract", () => {
  it("parses the v1 model output used by dashboard stats", () => {
    const metrics = parseAnalysisMetrics({
      version: 1,
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

describe("match color editor", () => {
  it("does not expose manual color picker inputs", () => {
    const source = readFileSync(join(process.cwd(), "components", "match-color-editor.tsx"), "utf8");
    expect(source).not.toContain('type="color"');
    expect(source).toContain("ArrowLeftRight");
  });
});
