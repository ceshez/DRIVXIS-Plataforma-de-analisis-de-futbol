import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(80),
  email: z.string().trim().email("Ingresa un correo valido.").toLowerCase(),
  password: z.string().min(8, "La contrasena debe tener al menos 8 caracteres.").max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Ingresa un correo valido.").toLowerCase(),
  password: z.string().min(1, "Ingresa tu contrasena."),
});

export const presignVideoSchema = z.object({
  filename: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().startsWith("video/"),
  sizeBytes: z.number().int().positive().max(12 * 1024 * 1024 * 1024),
});

export const createVideoSchema = presignVideoSchema.extend({
  objectKey: z.string().trim().min(8).max(600),
  durationSeconds: z.number().int().positive().optional(),
});
