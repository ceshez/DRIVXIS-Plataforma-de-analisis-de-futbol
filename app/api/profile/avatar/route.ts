import { readFile, rm, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { ensureLocalObjectDirectory, getLocalObjectPath } from "@/lib/local-storage";
import { prisma } from "@/lib/prisma";
import { deleteStorageObject, getStorageObject, isStorageConfigured, putStorageObject } from "@/lib/storage";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const [user, formData] = await Promise.all([requireUser(), request.formData().catch(() => null)]);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Selecciona una imagen para continuar." }, { status: 400 });
  }
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Formato no permitido. Usa JPG, PNG o WEBP." }, { status: 400 });
  }
  if (!file.size || file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: "La imagen supera el límite de 2MB." }, { status: 400 });
  }

  const previous = await prisma.user.findUnique({
    where: { id: user.id },
    select: { avatarObjectKey: true },
  });
  if (!previous) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  const nextObjectKey = createAvatarObjectKey(user.id, file.name || "avatar");
  const bytes = Buffer.from(await file.arrayBuffer());

  if (isStorageConfigured()) {
    await putStorageObject({
      objectKey: nextObjectKey,
      body: bytes,
      contentType: file.type,
    });
  } else {
    await ensureLocalObjectDirectory(nextObjectKey);
    await writeFile(getLocalObjectPath(nextObjectKey), bytes);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      avatarObjectKey: nextObjectKey,
      avatarMimeType: file.type,
    },
    select: {
      updatedAt: true,
      avatarObjectKey: true,
      avatarMimeType: true,
    },
  });

  if (previous.avatarObjectKey && previous.avatarObjectKey !== nextObjectKey) {
    await cleanupPreviousAvatar(user.id, previous.avatarObjectKey);
  }

  return NextResponse.json({
    ok: true,
    avatar: {
      objectKey: updated.avatarObjectKey,
      mimeType: updated.avatarMimeType,
      updatedAt: updated.updatedAt.toISOString(),
      url: `/api/profile/avatar?v=${updated.updatedAt.getTime()}`,
    },
  });
}

export async function GET() {
  const user = await requireUser();
  const avatarObjectKey = user.avatarObjectKey;
  const avatarMimeType = user.avatarMimeType || "";
  const headers = {
    "cache-control": "private, no-store, max-age=0",
  };

  if (!avatarObjectKey) {
    return new Response(buildFallbackAvatarSvg(user.name, user.email), {
      headers: {
        ...headers,
        "content-type": "image/svg+xml; charset=utf-8",
      },
    });
  }

  if (isStorageConfigured()) {
    try {
      const object = await getStorageObject(avatarObjectKey);
      if (object.Body) {
        return new Response(Readable.toWeb(object.Body as NodeJS.ReadableStream) as BodyInit, {
          headers: {
            ...headers,
            "content-type": object.ContentType || avatarMimeType || "application/octet-stream",
          },
        });
      }
    } catch {
      // Try local fallback and finally return generated fallback avatar.
    }
  }

  try {
    const localPath = getLocalObjectPath(avatarObjectKey);
    const bytes = await readFile(localPath);
    return new Response(bytes, {
      headers: {
        ...headers,
        "content-type": avatarMimeType || inferContentTypeFromObjectKey(avatarObjectKey),
      },
    });
  } catch {
    return new Response(buildFallbackAvatarSvg(user.name, user.email), {
      headers: {
        ...headers,
        "content-type": "image/svg+xml; charset=utf-8",
      },
    });
  }
}

async function cleanupPreviousAvatar(userId: string, objectKey: string) {
  if (!objectKey.startsWith(`users/${userId}/avatar/`)) return;

  if (isStorageConfigured()) {
    await deleteStorageObject(objectKey).catch(() => undefined);
  }

  try {
    const localPath = getLocalObjectPath(objectKey);
    await rm(localPath, { force: true });
  } catch {
    // Local fallback file may not exist.
  }
}

function createAvatarObjectKey(userId: string, filename: string) {
  const safe = sanitizeFilename(filename) || "avatar";
  return `users/${userId}/avatar/${crypto.randomUUID()}-${safe}`;
}

function sanitizeFilename(filename: string) {
  return filename
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function inferContentTypeFromObjectKey(objectKey: string) {
  const lower = objectKey.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function buildFallbackAvatarSvg(name: string, email: string) {
  const letter = (name?.trim() || email?.trim() || "U").charAt(0).toUpperCase();
  const escaped = letter.replace(/[<>&'"]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${escaped}"><rect width="64" height="64" rx="32" fill="#1b130f"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#ff6b2b" font-family="sans-serif" font-size="28" font-weight="700">${escaped}</text></svg>`;
}
