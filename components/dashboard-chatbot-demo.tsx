"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  ArrowUp,
  AudioLines,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  Database,
  Ellipsis,
  FileText,
  GitBranch,
  LoaderCircle,
  Menu,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Square,
  Target,
  Users,
  X,
} from "lucide-react";
import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { useAppPreferences } from "@/components/app-preferences-provider";
import { CHAT_COMMANDS } from "@/lib/chatbot";
import styles from "./dashboard-chatbot-demo.module.css";

type ChatMode = "GENERAL" | "TACTICAL" | "PHYSICAL";

type ChatThread = {
  id: string;
  title: string;
  mode: ChatMode;
  lastMessageAt: string;
  messageCount: number;
};

type VideoReference = {
  id: string;
  label: string;
  ownTeam?: string | null;
  rivalTeam?: string | null;
  status?: string;
  hasMetrics?: boolean;
  playedAt?: string;
};

type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  status: "PENDING" | "STREAMING" | "COMPLETED" | "FAILED";
  mode: ChatMode;
  content: string;
  command?: string | null;
  errorCode?: string | null;
  createdAt: string;
  videos: VideoReference[];
  attachments: ChatAttachment[];
};

type DashboardChatbotProps = {
  userName?: string | null;
  userEmail?: string | null;
  hasAvatar?: boolean;
  avatarVersion?: string | null;
  initialThreadId?: string | null;
};

const MODE_OPTIONS: Array<{ id: ChatMode; label: string; shortLabel: string }> = [
  { id: "TACTICAL", label: "Asistente táctico", shortLabel: "Táctico" },
  { id: "PHYSICAL", label: "Asistente físico", shortLabel: "Físico" },
  { id: "GENERAL", label: "Asistente general", shortLabel: "General" },
];

const COMMAND_ICONS = [Target, Activity, Bot, Users, GitBranch, FileText];

function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`${styles.brandWordmark} ${compact ? styles.brandWordmarkCompact : ""}`} aria-label="DRIVXIS">
      <span>DRI</span><span className={styles.brandWordmarkV}>V</span><span>XIS</span>
    </span>
  );
}

function formatRelativeDate(value: string, locale: "es" | "en") {
  const date = new Date(value);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return locale === "en" ? "Today" : "Hoy";
  if (days === 1) return locale === "en" ? "Yesterday" : "Ayer";
  if (days < 7) return locale === "en" ? `${days} days ago` : `Hace ${days} días`;
  const [month, day] = date.toISOString().slice(5, 10).split("-");
  return `${day}/${month}`;
}

function getMentionQuery(value: string) {
  const match = value.match(/(?:^|\s)@([^@\n]*)$/u);
  return match ? match[1].trim() : null;
}

function replaceLastMention(value: string, label: string) {
  return value.replace(/(?:^|\s)@([^@\n]*)$/u, (segment) => `${segment.startsWith(" ") ? " " : ""}@${label} `);
}

export function DashboardChatbot({
  userName,
  userEmail,
  hasAvatar = false,
  avatarVersion = null,
  initialThreadId = null,
}: DashboardChatbotProps) {
  const router = useRouter();
  const { locale } = useAppPreferences();
  const english = locale === "en";
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<ChatMode>("TACTICAL");
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null);
  const [selectedVideos, setSelectedVideos] = useState<VideoReference[]>([]);
  const [selectedAttachments, setSelectedAttachments] = useState<ChatAttachment[]>([]);
  const [mentionResults, setMentionResults] = useState<VideoReference[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [openRecentMenuId, setOpenRecentMenuId] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(Boolean(initialThreadId));
  const [streaming, setStreaming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [composerError, setComposerError] = useState<string | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const uploadRequestIdRef = useRef(0);

  const greetingName = useMemo(() => (userName || "Analista").trim().split(/\s+/)[0] || "Analista", [userName]);
  const activeMode = MODE_OPTIONS.find((option) => option.id === mode) || MODE_OPTIONS[0];
  const mentionQuery = getMentionQuery(draft);
  const commandMatches = draft.startsWith("/")
    ? CHAT_COMMANDS.filter((command) => `${command.slash} ${command.label}`.toLocaleLowerCase("es").includes(draft.toLocaleLowerCase("es").trim()))
    : [];
  const filteredThreads = threads.filter((thread) => thread.title.toLocaleLowerCase(locale).includes(searchQuery.toLocaleLowerCase(locale)));
  const isConversationMode = Boolean(activeThreadId) || messages.length > 0 || streaming;
  const canSend = draft.trim().length > 0 && !streaming;

  const loadThreads = useCallback(async () => {
    const response = await fetch("/api/chat/threads", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as { threads: ChatThread[] };
    setThreads(data.threads);
  }, []);

  const loadThread = useCallback(async (threadId: string) => {
    setLoadingThread(true);
    setComposerError(null);
    try {
      const response = await fetch(`/api/chat/threads/${threadId}`, { cache: "no-store" });
      if (!response.ok) throw new Error(english ? "Chat not found." : "No se encontró el chat.");
      const data = await response.json() as { thread: ChatThread; messages: ChatMessage[] };
      setActiveThreadId(data.thread.id);
      setMode(data.thread.mode);
      setMessages(data.messages);
      setSelectedVideos([]);
      setSelectedAttachments([]);
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "No se pudo abrir el chat.");
    } finally {
      setLoadingThread(false);
    }
  }, [english]);

  useEffect(() => { void loadThreads(); }, [loadThreads]);

  useEffect(() => {
    if (initialThreadId) void loadThread(initialThreadId);
  }, [initialThreadId, loadThread]);

  useEffect(() => {
    if (mentionQuery === null) {
      setMentionResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/chat/videos?q=${encodeURIComponent(mentionQuery)}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { videos: VideoReference[] };
      setMentionResults(data.videos.filter((video) => !selectedVideos.some((selected) => selected.id === video.id)));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [mentionQuery, selectedVideos]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTo({ top: thread.scrollHeight, behavior: streaming ? "auto" : "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (!openRecentMenuId && !modeMenuOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-chat-popover='true']")) {
        setOpenRecentMenuId(null);
        setModeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [modeMenuOpen, openRecentMenuId]);

  async function createThread() {
    const response = await fetch("/api/chat/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    if (!response.ok) throw new Error(english ? "Could not create chat." : "No se pudo crear el chat.");
    const data = await response.json() as { thread: ChatThread };
    setActiveThreadId(data.thread.id);
    setThreads((current) => [data.thread, ...current.filter((thread) => thread.id !== data.thread.id)]);
    router.replace(`/dashboard/chatbot/${data.thread.id}`);
    return data.thread.id;
  }

  function startNewChat() {
    abortControllerRef.current?.abort();
    setActiveThreadId(null);
    setMessages([]);
    setDraft("");
    setSelectedVideos([]);
    setSelectedAttachments([]);
    setComposerError(null);
    setMobileSidebarOpen(false);
    router.push("/dashboard/chatbot");
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function openThread(threadId: string) {
    if (streaming) return;
    setMobileSidebarOpen(false);
    router.push(`/dashboard/chatbot/${threadId}`);
    await loadThread(threadId);
  }

  async function renameThread(thread: ChatThread) {
    const title = window.prompt(english ? "Chat name" : "Nombre del chat", thread.title)?.trim();
    if (!title || title === thread.title) return;
    const response = await fetch(`/api/chat/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (response.ok) setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, title } : item));
    setOpenRecentMenuId(null);
  }

  async function deleteThread(thread: ChatThread) {
    if (!window.confirm(english ? `Delete “${thread.title}”?` : `¿Eliminar “${thread.title}”?`)) return;
    const response = await fetch(`/api/chat/threads/${thread.id}`, { method: "DELETE" });
    if (!response.ok) return;
    setThreads((current) => current.filter((item) => item.id !== thread.id));
    if (activeThreadId === thread.id) startNewChat();
    setOpenRecentMenuId(null);
  }

  async function changeMode(nextMode: ChatMode) {
    setMode(nextMode);
    setModeMenuOpen(false);
    if (!activeThreadId) return;
    await fetch(`/api/chat/threads/${activeThreadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: nextMode }),
    });
  }

  function applyCommand(command: (typeof CHAT_COMMANDS)[number]) {
    setMode(command.mode as ChatMode);
    setSelectedCommand(command.id);
    setDraft(`${command.slash} `);
    setComposerError(null);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function selectVideo(video: VideoReference) {
    setSelectedVideos((current) => [...current, video]);
    setDraft((current) => replaceLastMention(current, video.label));
    setMentionResults([]);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function uploadAttachment(file: File) {
    const requestId = ++uploadRequestIdRef.current;
    setUploading(true);
    setComposerError(null);
    try {
      const threadId = activeThreadId || await createThread();
      const form = new FormData();
      form.set("threadId", threadId);
      form.set("file", file);
      const response = await fetch("/api/chat/attachments", { method: "POST", body: form });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(errorData?.error || "No se pudo adjuntar el documento.");
      }
      const data = await response.json() as { attachment?: ChatAttachment };
      if (!data.attachment) throw new Error("No se pudo adjuntar el documento.");
      setSelectedAttachments((current) => [...current, data.attachment!]);
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "No se pudo adjuntar el documento.");
    } finally {
      if (uploadRequestIdRef.current === requestId) {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  }

  async function removeAttachment(attachment: ChatAttachment) {
    setSelectedAttachments((current) => current.filter((item) => item.id !== attachment.id));
    const response = await fetch(`/api/chat/attachments/${attachment.id}`, { method: "DELETE" });
    if (!response.ok) setComposerError(english ? "Could not remove the document." : "No se pudo eliminar el documento.");
  }

  async function transcribeRecording(blob: Blob) {
    setVoiceState("transcribing");
    try {
      const form = new FormData();
      form.set("audio", new File([blob], "consulta.webm", { type: blob.type || "audio/webm" }));
      const response = await fetch("/api/chat/transcriptions", { method: "POST", body: form });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(errorData?.error || "No se pudo reconocer la voz.");
      }
      const data = await response.json() as { text?: string };
      if (!data.text) throw new Error("No se pudo reconocer la voz.");
      setDraft((current) => `${current}${current.trim() ? " " : ""}${data.text}`);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "No se pudo reconocer la voz.");
    } finally {
      setVoiceState("idle");
    }
  }

  async function toggleVoice() {
    if (voiceState === "recording") {
      recorderRef.current?.stop();
      return;
    }
    if (voiceState !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setComposerError(english ? "Voice recording is not supported in this browser." : "Este navegador no permite grabar voz.");
      return;
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = mediaStream;
      recordingChunksRef.current = [];
      const recorder = new MediaRecorder(mediaStream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) recordingChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        void transcribeRecording(blob);
      };
      recorder.start();
      setVoiceState("recording");
      setComposerError(null);
    } catch {
      setComposerError(english ? "Microphone permission was not granted." : "No se concedió permiso para usar el micrófono.");
    }
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!content || streaming) return;
    setComposerError(null);
    let threadId: string;
    try {
      threadId = activeThreadId || await createThread();
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "No se pudo crear el chat.");
      return;
    }

    const tempUserId = `user-${crypto.randomUUID()}`;
    const tempAssistantId = `assistant-${crypto.randomUUID()}`;
    const sentVideos = [...selectedVideos];
    const sentAttachments = [...selectedAttachments];
    const sentCommand = selectedCommand;
    const timestamp = new Date().toISOString();
    setMessages((current) => [
      ...current,
      { id: tempUserId, role: "user", status: "COMPLETED", mode, content, command: sentCommand, createdAt: timestamp, videos: sentVideos, attachments: sentAttachments },
      { id: tempAssistantId, role: "assistant", status: "STREAMING", mode, content: "", command: sentCommand, createdAt: timestamp, videos: [], attachments: [] },
    ]);
    setDraft("");
    setSelectedVideos([]);
    setSelectedAttachments([]);
    setSelectedCommand(null);
    setStreaming(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`/api/chat/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          mode,
          command: sentCommand || undefined,
          videoIds: sentVideos.map((video) => video.id),
          attachmentIds: sentAttachments.map((attachment) => attachment.id),
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || "No se pudo iniciar la respuesta.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; text?: string; message?: string; messageId?: string; userMessageId?: string; title?: string; code?: string };
          if (event.type === "delta" && event.text) {
            setMessages((current) => current.map((message) => message.id === tempAssistantId ? { ...message, content: message.content + event.text } : message));
          }
          if (event.type === "error") {
            setMessages((current) => current.map((message) => message.id === tempAssistantId ? { ...message, status: "FAILED", errorCode: event.code, content: message.content || event.message || "No se pudo responder." } : message));
          }
          if (event.type === "done") {
            setMessages((current) => current.map((message) => {
              if (message.id === tempUserId) return { ...message, id: event.userMessageId || message.id };
              if (message.id === tempAssistantId) return { ...message, id: event.messageId || message.id, status: "COMPLETED" };
              return message;
            }));
            if (event.title) setThreads((current) => current.map((thread) => thread.id === threadId ? { ...thread, title: event.title! } : thread));
          }
        }
        if (done) break;
      }
      await loadThreads();
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      setMessages((current) => current.map((message) => message.id === tempAssistantId ? {
        ...message,
        status: "FAILED",
        content: message.content || (aborted ? (english ? "Response stopped." : "Respuesta detenida.") : (error instanceof Error ? error.message : "No se pudo responder.")),
      } : message));
    } finally {
      setStreaming(false);
      abortControllerRef.current = null;
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function renderComposer(chat = false) {
    return (
      <div className={styles.composerWrapper}>
        <form className={`${styles.composer} ${chat ? styles.composerChat : styles.composerEmpty}`} onSubmit={handleSubmit}>
          <label className="visually-hidden" htmlFor={chat ? "chatbot-composer-active" : "chatbot-composer"}>
            {english ? "Write your message" : "Escribe tu mensaje"}
          </label>
          <textarea
            id={chat ? "chatbot-composer-active" : "chatbot-composer"}
            ref={inputRef}
            rows={chat ? 2 : 3}
            className={styles.composerTextarea}
            value={draft}
            disabled={streaming}
            onChange={(event) => {
              const nextDraft = event.target.value;
              setDraft(nextDraft);
              const command = CHAT_COMMANDS.find((item) => nextDraft.startsWith(item.slash));
              setSelectedCommand(command?.id || null);
              if (command) setMode(command.mode as ChatMode);
              setComposerError(null);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder={english ? "Ask about your matches, type / or reference @video…" : "Pregunta por tus partidos, escribe / o referencia @video…"}
          />

          {(selectedVideos.length > 0 || selectedAttachments.length > 0) ? (
            <div className={styles.contextChips}>
              {selectedVideos.map((video) => (
                <button key={video.id} type="button" className={styles.contextChip} onClick={() => setSelectedVideos((current) => current.filter((item) => item.id !== video.id))}>
                  <Database size={11} /><span>@{video.label}</span><X size={10} />
                </button>
              ))}
              {selectedAttachments.map((attachment) => (
                <button key={attachment.id} type="button" className={styles.contextChip} onClick={() => void removeAttachment(attachment)}>
                  <FileText size={11} /><span>{attachment.name}</span><X size={10} />
                </button>
              ))}
            </div>
          ) : null}

          <div className={styles.composerFooter}>
            <div className={styles.composerTools}>
              <input
                ref={fileInputRef}
                className={styles.hiddenFileInput}
                type="file"
                aria-label={english ? "Select document" : "Seleccionar documento"}
                accept=".pdf,.txt,.csv,.md,.json,image/png,image/jpeg,image/webp"
                onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttachment(file); }}
              />
              <button type="button" className={styles.toolButton} disabled={uploading || streaming} aria-label={english ? "Add document" : "Agregar documento"} onClick={() => fileInputRef.current?.click()}>
                {uploading ? <LoaderCircle size={15} className={styles.spin} /> : <Plus size={15} />}
              </button>

              <div className={styles.modePickerRoot} data-chat-popover="true">
                <button type="button" className={styles.assistantPicker} aria-haspopup="menu" aria-expanded={modeMenuOpen} onClick={() => setModeMenuOpen((open) => !open)}>
                  <strong>{english ? activeMode.shortLabel : activeMode.label}</strong><ChevronDown size={14} />
                </button>
                {modeMenuOpen ? (
                  <div className={styles.modeMenu} role="menu">
                    {MODE_OPTIONS.map((option) => (
                      <button key={option.id} type="button" role="menuitemradio" aria-checked={mode === option.id} onClick={() => void changeMode(option.id)}>
                        <span>{option.label}</span>{mode === option.id ? <Check size={12} /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className={`${styles.toolButton} ${voiceState === "recording" ? styles.recordingButton : ""}`}
                disabled={voiceState === "transcribing" || streaming}
                aria-label={voiceState === "recording" ? (english ? "Stop recording" : "Detener grabación") : (english ? "Dictate by voice" : "Dictar por voz")}
                onClick={() => void toggleVoice()}
              >
                {voiceState === "transcribing" ? <LoaderCircle size={15} className={styles.spin} /> : voiceState === "recording" ? <Square size={12} /> : <AudioLines size={16} />}
              </button>
            </div>

            {streaming ? (
              <button className={styles.sendButton} type="button" aria-label={english ? "Stop response" : "Detener respuesta"} onClick={() => abortControllerRef.current?.abort()}><Square size={12} /></button>
            ) : (
              <button className={styles.sendButton} type="submit" disabled={!canSend} aria-label={english ? "Send message" : "Enviar mensaje"}><ArrowUp size={14} /></button>
            )}
          </div>
        </form>

        {commandMatches.length > 0 ? (
          <div className={styles.composerPalette} role="listbox" aria-label={english ? "Analysis commands" : "Comandos de análisis"}>
            {commandMatches.map((command, index) => {
              const Icon = COMMAND_ICONS[index % COMMAND_ICONS.length];
              return <button key={command.id} type="button" onClick={() => applyCommand(command)}><Icon size={13} /><span><strong>{command.slash}</strong>{command.label}</span></button>;
            })}
          </div>
        ) : null}

        {mentionQuery !== null && mentionResults.length > 0 ? (
          <div className={styles.composerPalette} role="listbox" aria-label={english ? "Uploaded matches" : "Partidos subidos"}>
            {mentionResults.map((video) => (
              <button key={video.id} type="button" onClick={() => selectVideo(video)}>
                <Database size={13} />
                <span><strong>{video.label}</strong>{video.ownTeam && video.rivalTeam ? `${video.ownTeam} vs ${video.rivalTeam}` : (video.hasMetrics ? "Métricas disponibles" : "Análisis pendiente")}</span>
              </button>
            ))}
          </div>
        ) : null}

        {composerError ? <p className={styles.composerError}>{composerError}</p> : null}
        {voiceState === "recording" ? <p className={styles.recordingStatus}><Mic size={11} /> Grabando… toca el botón para terminar</p> : null}
      </div>
    );
  }

  const rootClassName = `${styles.shell} ${sidebarCollapsed ? styles.sidebarCollapsed : ""}`;
  const sidebarClassName = `${styles.sidebar} ${mobileSidebarOpen ? styles.sidebarMobileOpen : ""}`;

  return (
    <section className={rootClassName}>
      <div className={styles.layout}>
        <aside className={sidebarClassName} aria-label={english ? "Chat history" : "Historial de chats"}>
          <div className={styles.sidebarInner}>
            <div className={styles.mobileHeader}>
              <BrandWordmark compact />
              <button type="button" aria-label={english ? "Close history" : "Cerrar historial"} onClick={() => setMobileSidebarOpen(false)}><X size={14} /></button>
            </div>
            <div className={styles.desktopHeader}>
              <div className={styles.brandRow}>
                <Link href="/dashboard/chatbot" className={styles.brandLink}><BrandWordmark /></Link>
                <button type="button" className={`${styles.collapseButton} ${styles.collapsedTooltipTrigger}`} aria-label={sidebarCollapsed ? (english ? "Expand sidebar" : "Expandir barra") : (english ? "Collapse sidebar" : "Contraer barra")} data-tooltip={english ? "Collapse sidebar" : "Contraer barra"} onClick={() => setSidebarCollapsed((value) => !value)}>
                  {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
                </button>
              </div>
              <Link href="/dashboard" className={`${styles.backLink} ${styles.collapsedTooltipTrigger}`} data-tooltip={english ? "Back to dashboard" : "Volver al panel"}>
                <span className={styles.backLinkIcon}><ArrowLeft size={12} /></span><span className={styles.backLinkLabel}>{english ? "Back to dashboard" : "Volver al panel"}</span>
              </Link>
            </div>

            <div className={styles.navArea}>
              <ul className={styles.navList}>
                <li><button type="button" className={`${styles.navItem} ${styles.navItemActive}`} onClick={startNewChat}><Plus size={14} /><span className={styles.navText}>{english ? "New chat" : "Nuevo chat"}</span></button></li>
                <li><button type="button" className={styles.navItem} onClick={() => setSearchOpen((open) => !open)}><Search size={14} /><span className={styles.navText}>{english ? "Search chats" : "Buscar chats"}</span></button></li>
              </ul>
              {searchOpen ? <input className={styles.chatSearchInput} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={english ? "Search…" : "Buscar…"} autoFocus /> : null}

              <div className={styles.recentSection}>
                <p className={styles.recentTitle}>{english ? "Recent" : "Recientes"}</p>
                <ul className={styles.recentList}>
                  {filteredThreads.length === 0 ? <li className={styles.emptyRecent}>{english ? "No chats yet" : "Aún no hay chats"}</li> : null}
                  {filteredThreads.map((thread) => (
                    <li key={thread.id} className={`${styles.recentItem} ${activeThreadId === thread.id ? styles.recentItemActive : ""}`} data-chat-popover="true">
                      <button type="button" className={styles.recentRow} disabled={streaming} onClick={() => void openThread(thread.id)}>
                        <Clock3 size={10} /><span><strong>{thread.title}</strong><small>{formatRelativeDate(thread.lastMessageAt, locale)}</small></span>
                      </button>
                      <button type="button" className={styles.recentMenuButton} aria-label={english ? "Chat options" : "Opciones del chat"} onClick={() => setOpenRecentMenuId((id) => id === thread.id ? null : thread.id)}><Ellipsis size={12} /></button>
                      {openRecentMenuId === thread.id ? (
                        <div className={styles.recentMenu} role="menu">
                          <button type="button" role="menuitem" onClick={() => void renameThread(thread)}>{english ? "Rename" : "Cambiar nombre"}</button>
                          <button type="button" role="menuitem" onClick={() => void deleteThread(thread)}>{english ? "Delete" : "Eliminar"}</button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className={styles.userDock}>
              <div className={styles.userExpanded}><UserProfileMenu name={userName} email={userEmail} hasAvatar={hasAvatar} avatarVersion={avatarVersion} dropdownDirection="up" triggerVariant="sidebar-card" showSidebarSettingsIcon /></div>
              <div className={styles.userCollapsed}><UserProfileMenu name={userName} email={userEmail} hasAvatar={hasAvatar} avatarVersion={avatarVersion} dropdownDirection="up" /></div>
            </div>
          </div>
        </aside>

        <div className={styles.workspace}>
          <header className={styles.mobileTopbar}>
            <button type="button" aria-label={english ? "Open history" : "Abrir historial"} onClick={() => setMobileSidebarOpen(true)}><Menu size={15} /></button>
            <BrandWordmark compact />
            <div className={styles.mobileViewSwitch} role="group" aria-label={english ? "Chatbot view" : "Vista del chatbot"}>
              <button type="button" className={`${styles.mobileViewButton} ${!mobileSidebarOpen ? styles.mobileViewButtonActive : ""}`} aria-pressed={!mobileSidebarOpen} onClick={() => setMobileSidebarOpen(false)}><PanelLeftOpen size={13} /><span>Panel</span></button>
              <button type="button" className={`${styles.mobileViewButton} ${mobileSidebarOpen ? styles.mobileViewButtonActive : ""}`} aria-pressed={mobileSidebarOpen} onClick={() => setMobileSidebarOpen(true)}><Clock3 size={13} /><span>{english ? "History" : "Historial"}</span></button>
            </div>
          </header>

          {isConversationMode ? (
            <div className={styles.conversation}>
              <div className={styles.thread} ref={threadRef} aria-live="polite">
                <div className={styles.threadMessages}>
                  {loadingThread ? <div className={styles.threadLoading}><LoaderCircle className={styles.spin} size={18} /> {english ? "Loading chat…" : "Cargando chat…"}</div> : null}
                  {messages.map((message) => (
                    <article key={message.id} className={`${styles.message} ${message.role === "user" ? styles.messageUser : styles.messageAssistant} ${message.status === "FAILED" ? styles.messageFailed : ""}`}>
                      <div className={styles.messageText}>{message.content || (message.status === "STREAMING" ? <span className={styles.thinkingDots}><i /><i /><i /></span> : null)}</div>
                      {(message.videos.length > 0 || message.attachments.length > 0) ? (
                        <div className={styles.messageSources}>
                          {message.videos.map((video) => <span key={video.id}><Database size={10} /> @{video.label}</span>)}
                          {message.attachments.map((attachment) => <span key={attachment.id}><FileText size={10} /> {attachment.name}</span>)}
                        </div>
                      ) : null}
                      {message.role === "assistant" && message.status === "COMPLETED" ? <small className={styles.aiSourceLabel}><Database size={10} /> IA real · contexto DRIVXIS</small> : null}
                    </article>
                  ))}
                </div>
              </div>
              <div className={styles.composerDock}><div className={styles.composerDockInner}>{renderComposer(true)}</div></div>
            </div>
          ) : (
            <div className={`${styles.landing} ${styles.landingIntro}`}>
              <div className={styles.centerStack}>
                <div className={styles.hero}>
                  <h1 className={styles.heroTitle}>{english ? "Hello" : "Hola"}, {greetingName}</h1>
                  <p className={styles.heroSubtitle}>{english ? "Real analysis from your uploaded match data" : "Análisis real a partir de los datos de tus partidos"}</p>
                </div>
                <div className={styles.composerStack}>
                  {renderComposer(false)}
                  <div className={styles.suggestionGrid} aria-label={english ? "Analysis commands" : "Comandos de análisis"}>
                    {CHAT_COMMANDS.map((command, index) => {
                      const Icon = COMMAND_ICONS[index];
                      return <button key={command.id} type="button" className={styles.suggestionChip} onClick={() => applyCommand(command)}><Icon size={13} /><span><strong>{command.slash}</strong>{command.label}</span></button>;
                    })}
                  </div>
                </div>
              </div>
              <p className={styles.privacyNote}><span>◌</span> {english ? "Only your authorized match data is used." : "Solo se usan los datos de partidos autorizados para tu cuenta."}</p>
            </div>
          )}
        </div>
      </div>

      {mobileSidebarOpen ? <button type="button" className={styles.overlay} aria-label={english ? "Close history" : "Cerrar historial"} onClick={() => setMobileSidebarOpen(false)} /> : null}
    </section>
  );
}

export const DashboardChatbotDemo = DashboardChatbot;
