import type { ModelMessage, UserContent } from "ai";
import { streamText } from "ai";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getStorageObject } from "@/lib/storage";
import { buildChatDataContext } from "@/lib/chat-context";
import { buildChatInstructions } from "@/lib/chat-prompt";
import { createChatTitle, getChatErrorCode, getChatErrorMessage } from "@/lib/chatbot";
import { createChatMessageSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ threadId: string }> };

async function getAttachmentContentParts(
  attachments: Array<{ objectKey: string; originalFilename: string; mimeType: string }>,
): Promise<Exclude<UserContent, string>> {
  const parts: Exclude<UserContent, string> = [];
  for (const attachment of attachments) {
    try {
      const object = await getStorageObject(attachment.objectKey);
      const bytes = await object.Body?.transformToByteArray();
      if (!bytes) throw new Error("Documento vacío.");

      if (
        attachment.mimeType.startsWith("text/") ||
        attachment.mimeType === "application/json"
      ) {
        const text = new TextDecoder().decode(bytes).slice(0, 80_000);
        parts.push({
          type: "text",
          text: `\nDOCUMENTO ADJUNTO: ${attachment.originalFilename}\n---\n${text}\n---\nFIN DEL DOCUMENTO`,
        });
      } else {
        parts.push({
          type: "file",
          data: bytes,
          mediaType: attachment.mimeType,
          filename: attachment.originalFilename,
        });
      }
    } catch {
      parts.push({
        type: "text",
        text: `El documento ${attachment.originalFilename} no pudo recuperarse del almacenamiento. No inventes su contenido.`,
      });
    }
  }
  return parts;
}

export async function POST(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { threadId } = await context.params;
  const parsed = createChatMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || "Consulta inválida." }, { status: 400 });
  }

  const thread = await prisma.chatThread.findFirst({
    where: { id: threadId, ownerId: user.id },
    select: { id: true, title: true },
  });
  if (!thread) return Response.json({ error: "Chat no encontrado." }, { status: 404 });

  const videoIds = [...new Set(parsed.data.videoIds)];
  const attachmentIds = [...new Set(parsed.data.attachmentIds)];
  const [videos, attachments, previousMessages] = await Promise.all([
    prisma.video.findMany({ where: { id: { in: videoIds }, ownerId: user.id }, select: { id: true } }),
    prisma.chatAttachment.findMany({
      where: { id: { in: attachmentIds }, ownerId: user.id, threadId, messageId: null, status: "READY" },
      select: { id: true, objectKey: true, originalFilename: true, mimeType: true },
    }),
    prisma.chatMessage.findMany({
      where: { threadId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { role: true, content: true },
    }),
  ]);
  if (videos.length !== videoIds.length) return Response.json({ error: "Una referencia de video no es válida." }, { status: 403 });
  if (attachments.length !== attachmentIds.length) return Response.json({ error: "Un documento no es válido o ya fue enviado." }, { status: 403 });

  const now = new Date();
  const title = thread.title === "Nuevo chat" ? createChatTitle(parsed.data.content) : thread.title;
  const [userMessage, assistantMessage] = await prisma.$transaction(async (tx) => {
    const createdUserMessage = await tx.chatMessage.create({
      data: {
        threadId,
        role: "USER",
        status: "COMPLETED",
        mode: parsed.data.mode,
        content: parsed.data.content,
        command: parsed.data.command,
        videoLinks: videoIds.length ? { createMany: { data: videoIds.map((videoId) => ({ videoId })) } } : undefined,
      },
    });
    if (attachmentIds.length) {
      await tx.chatAttachment.updateMany({ where: { id: { in: attachmentIds } }, data: { messageId: createdUserMessage.id } });
    }
    const createdAssistantMessage = await tx.chatMessage.create({
      data: {
        threadId,
        role: "ASSISTANT",
        status: "STREAMING",
        mode: parsed.data.mode,
        content: "",
        command: parsed.data.command,
      },
    });
    await tx.chatThread.update({
      where: { id: threadId },
      data: { mode: parsed.data.mode, title, lastMessageAt: now },
    });
    return [createdUserMessage, createdAssistantMessage] as const;
  });

  const dataContext = await buildChatDataContext({ userId: user.id, content: parsed.data.content, explicitVideoIds: videoIds });
  const attachmentParts = await getAttachmentContentParts(attachments);
  const modelMessages: ModelMessage[] = [
    ...previousMessages.reverse().map((message): ModelMessage => ({
      role: message.role === "USER" ? "user" : "assistant",
      content: message.content,
    })),
    {
      role: "user",
      content: [{ type: "text", text: parsed.data.content }, ...attachmentParts],
    },
  ];

  const modelId = process.env.CHAT_MODEL_ID || "openai/gpt-5.4-mini";
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      const send = (event: object) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = streamText({
          model: modelId,
          instructions: buildChatInstructions({ mode: parsed.data.mode, command: parsed.data.command, context: dataContext }),
          messages: modelMessages,
          temperature: 0.2,
          maxOutputTokens: 2_400,
          abortSignal: AbortSignal.any([request.signal, AbortSignal.timeout(58_000)]),
          providerOptions: {
            gateway: {
              user: user.id,
              tags: ["feature:drivxis-chatbot", `mode:${parsed.data.mode.toLowerCase()}`],
              models: ["openai/gpt-5.4-nano"],
              disallowPromptTraining: true,
            },
          },
        });

        for await (const delta of result.textStream) {
          answer += delta;
          send({ type: "delta", text: delta });
        }
        const usage = await result.totalUsage;
        await prisma.chatMessage.update({
          where: { id: assistantMessage.id },
          data: {
            content: answer,
            status: "COMPLETED",
            metadata: {
              model: modelId,
              inputTokens: usage.inputTokens ?? null,
              outputTokens: usage.outputTokens ?? null,
              totalTokens: usage.totalTokens ?? null,
              sourceVideoIds: dataContext.matches.map((match) => match.id),
            },
          },
        });
        send({ type: "done", messageId: assistantMessage.id, userMessageId: userMessage.id, title });
      } catch (error) {
        const code = getChatErrorCode(error);
        await prisma.chatMessage.update({
          where: { id: assistantMessage.id },
          data: { content: answer, status: "FAILED", errorCode: code },
        }).catch(() => undefined);
        send({ type: "error", code, message: getChatErrorMessage(code) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
      "X-Chat-User-Message-Id": userMessage.id,
      "X-Chat-Assistant-Message-Id": assistantMessage.id,
    },
  });
}
