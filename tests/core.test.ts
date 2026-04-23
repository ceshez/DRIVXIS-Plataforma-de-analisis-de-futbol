import { describe, expect, it } from "vitest";
import { pickLocale } from "@/lib/i18n";
import { createVideoObjectKey } from "@/lib/storage";
import { loginSchema, presignVideoSchema, registerSchema } from "@/lib/validators";

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

  it("accepts login credentials shape", () => {
    expect(loginSchema.safeParse({ email: "analyst@club.com", password: "secret" }).success).toBe(true);
  });
});
