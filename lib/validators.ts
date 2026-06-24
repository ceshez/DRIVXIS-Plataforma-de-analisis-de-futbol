import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(80),
  email: z.string().trim().email("Ingresa un correo valido.").toLowerCase(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Ingresa un correo valido.").toLowerCase(),
  password: z.string().min(1, "Ingresa tu contraseña."),
});

export const presignVideoSchema = z.object({
  filename: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().startsWith("video/"),
  sizeBytes: z.number().int().positive().max(12 * 1024 * 1024 * 1024),
});

export const createVideoSchema = presignVideoSchema.extend({
  objectKey: z.string().trim().min(8).max(600),
  uploadMode: z.enum(["local", "s3"]).optional(),
  durationSeconds: z.number().int().positive().optional(),
  matchInfo: z
    .object({
      ownTeam: z.string().trim().min(2).max(80),
      rivalTeam: z.string().trim().min(2).max(80),
      ownTeamColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      rivalTeamColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    })
    .optional(),
});

export const updateVideoMatchSchema = z.object({
  matchInfo: z.object({
    ownTeamColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
    rivalTeamColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
  }),
});

export const createTeamSchema = z.object({
  name: z.string().trim().min(2, "El nombre del equipo debe tener al menos 2 caracteres.").max(100),
  season: z.string().trim().min(2).max(40).optional(),
});

export const createPlayerSchema = z.object({
  name: z.string().trim().min(2, "El nombre del jugador debe tener al menos 2 caracteres.").max(100),
  position: z.string().trim().min(2, "Indica una posición.").max(60),
  shirtNumber: z.number().int().min(0).max(99).optional(),
  birthDate: z.string().date().optional(),
  status: z.enum(["ACTIVE", "INJURED", "INACTIVE"]).default("ACTIVE"),
});

export const createTeamInvitationSchema = z.object({
  email: z.string().trim().email("Ingresa un correo válido.").toLowerCase(),
  role: z.enum(["ADMIN", "ANALYST", "COACH", "VIEWER"]),
});
