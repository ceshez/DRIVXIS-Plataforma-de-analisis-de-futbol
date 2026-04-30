import { describe, expect, it } from "vitest";
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
      speed: {
        maxKmh: 31.4,
        avgKmh: 18.2,
        players: [{ id: 8, team: 1, maxKmh: 31.4, avgKmh: 19.1, distanceMeters: 9140 }],
      },
      distance: { totalMeters: 101420 },
      video: { frameCount: 1200, fps: 24, durationSeconds: 50, annotatedAvailable: true },
    });

    expect(metrics?.possession.team1Pct).toBe(57.2);
    expect(metrics?.speed.players[0]?.team).toBe(1);
    expect(metrics?.video.annotatedAvailable).toBe(true);
  });

  it("rejects unknown metric versions", () => {
    expect(parseAnalysisMetrics({ version: 2 })).toBeNull();
  });
});
