"use client";

import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ArrowUp,
  AudioLines,
  Bot,
  CalendarDays,
  ChevronDown,
  Clock3,
  FileText,
  GitBranch,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Plus,
  Search,
  SlidersHorizontal,
  Target,
  Users,
  X,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { chatbotStarterPrompts, getDemoAssistantResponse } from "@/lib/chatbot-demo";
import styles from "./dashboard-chatbot-demo.module.css";

type DashboardChatbotDemoProps = {
  userName?: string | null;
  userEmail?: string | null;
  hasAvatar?: boolean;
  avatarVersion?: string | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type PendingReply = {
  id: string;
  content: string;
};

type AssistantPhase = "idle" | "thinking" | "typing";

const navItems = [
  { id: "new", label: "Nuevo chat", icon: Plus },
  { id: "search", label: "Buscar", icon: Search },
  { id: "chats", label: "Chats", icon: MessageSquare, active: true },
  { id: "seasons", label: "Temporadas", icon: CalendarDays },
  { id: "custom", label: "Personalizar", icon: SlidersHorizontal },
];

const recentItems = [
  "Análisis táctico jornada 3",
  "Patrones de presión alta",
  "Transiciones defensivas vs Real",
  "Rendimiento mediocampo Q1",
  "Errores defensivos vs Saprissa",
  "Comparación entre extremos",
];

const starterPromptIcons = [Target, Activity, Bot, Users, GitBranch, FileText];

function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`${styles.brandWordmark} ${compact ? styles.brandWordmarkCompact : ""}`} aria-label="DRIVXIS">
      <span>DRI</span>
      <span className={styles.brandWordmarkV}>V</span>
      <span>XIS</span>
    </span>
  );
}

export function DashboardChatbotDemo({
  userName,
  userEmail,
  hasAvatar = false,
  avatarVersion = null,
}: DashboardChatbotDemoProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [hasSentFirstMessage, setHasSentFirstMessage] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [assistantPhase, setAssistantPhase] = useState<AssistantPhase>("idle");
  const [typingText, setTypingText] = useState("");
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const [replyQueue, setReplyQueue] = useState<PendingReply[]>([]);
  const [activeReply, setActiveReply] = useState<PendingReply | null>(null);

  const messageCounterRef = useRef(0);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoScrollEnabledRef = useRef(true);

  const trimmedDraft = draft.trim();
  const showEmptyIntro = !hasSentFirstMessage && trimmedDraft.length === 0;
  const showStarterPrompts = !hasSentFirstMessage;
  const isAssistantThinking = assistantPhase === "thinking";
  const isAssistantTyping = assistantPhase === "typing";
  const isConversationMode = hasSentFirstMessage || messages.length > 0 || assistantPhase !== "idle";

  const rootClassName = [styles.shell, sidebarCollapsed ? styles.sidebarCollapsed : ""].filter(Boolean).join(" ");
  const sidebarClassName = [styles.sidebar, mobileSidebarOpen ? styles.sidebarMobileOpen : ""].filter(Boolean).join(" ");

  const starterPromptEntries = useMemo(() => {
    return chatbotStarterPrompts.map((prompt, index) => ({
      prompt,
      Icon: starterPromptIcons[index % starterPromptIcons.length],
    }));
  }, []);

  const greetingName = useMemo(() => {
    const source = (userName || "Carlos").trim();
    if (source.length === 0) return "Carlos";
    return source.split(/\s+/)[0] || "Carlos";
  }, [userName]);

  useEffect(() => {
    if (activeReply || replyQueue.length === 0) return;
    setActiveReply(replyQueue[0]);
    setReplyQueue((current) => current.slice(1));
  }, [activeReply, replyQueue]);

  useEffect(() => {
    if (!activeReply) return;

    let typingInterval: ReturnType<typeof setInterval> | null = null;
    let thinkingTimeout: ReturnType<typeof setTimeout> | null = null;
    let cursor = 0;

    setAssistantPhase("thinking");
    setTypingText("");

    thinkingTimeout = setTimeout(() => {
      setAssistantPhase("typing");

      typingInterval = setInterval(() => {
        const chunk = Math.max(1, Math.min(3, Math.floor(Math.random() * 3) + 1));
        cursor = Math.min(activeReply.content.length, cursor + chunk);
        setTypingText(activeReply.content.slice(0, cursor));

        if (cursor < activeReply.content.length) return;

        if (typingInterval) {
          clearInterval(typingInterval);
          typingInterval = null;
        }

        setMessages((current) => [
          ...current,
          {
            id: activeReply.id,
            role: "assistant",
            content: activeReply.content,
          },
        ]);
        setTypingText("");
        setAssistantPhase("idle");
        setActiveReply(null);
      }, 34);
    }, 360);

    return () => {
      if (thinkingTimeout) clearTimeout(thinkingTimeout);
      if (typingInterval) clearInterval(typingInterval);
    };
  }, [activeReply]);

  useEffect(() => {
    if (!autoScrollEnabledRef.current) return;
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTo({
      top: thread.scrollHeight,
      behavior: isAssistantTyping ? "auto" : "smooth",
    });
  }, [assistantPhase, isAssistantTyping, messages, typingText]);

  useEffect(() => {
    if (!selectedPrompt) return;
    inputRef.current?.focus();
  }, [selectedPrompt]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileSidebarOpen]);

  function nextMessageId(role: ChatMessage["role"]) {
    messageCounterRef.current += 1;
    return `${role}-${Date.now()}-${messageCounterRef.current}`;
  }

  function queueAssistantReply(message: string) {
    const response = getDemoAssistantResponse(message);
    setReplyQueue((current) => [...current, { id: nextMessageId("assistant"), content: response }]);
  }

  function updateAutoScrollPreference() {
    const thread = threadRef.current;
    if (!thread) return;
    const distanceToBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
    autoScrollEnabledRef.current = distanceToBottom <= 120;
  }

  function sendMessage() {
    if (trimmedDraft.length === 0) return;

    const outbound = trimmedDraft;
    setMessages((current) => [
      ...current,
      {
        id: nextMessageId("user"),
        role: "user",
        content: outbound,
      },
    ]);
    setHasSentFirstMessage(true);
    setDraft("");
    setSelectedPrompt("");
    queueAssistantReply(outbound);
    autoScrollEnabledRef.current = true;
    setMobileSidebarOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    sendMessage();
  }

  function applyStarterPrompt(prompt: string) {
    setSelectedPrompt(prompt);
    setDraft(prompt);
    setMobileSidebarOpen(false);
  }

  return (
    <section className={rootClassName}>
      <div className={styles.layout}>
        <aside className={sidebarClassName} aria-label="Navegación de chatbot">
          <div className={styles.sidebarInner}>
            <div className={styles.mobileHeader}>
              <BrandWordmark compact />
              <button type="button" aria-label="Cerrar panel" onClick={() => setMobileSidebarOpen(false)}>
                <X size={14} />
              </button>
            </div>

            <div className={styles.desktopHeader}>
              <div className={styles.brandRow}>
                <Link href="/dashboard/chatbot" className={styles.brandLink} aria-label="Chatbot DRIVXIS">
                  <BrandWordmark />
                </Link>
                <button
                  type="button"
                  className={styles.collapseButton}
                  onClick={() => setSidebarCollapsed((value) => !value)}
                  aria-label={sidebarCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
                >
                  {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
                </button>
              </div>

              <Link href="/dashboard" className={styles.backLink}>
                <ArrowLeft size={12} />
                <span>Volver al dashboard</span>
              </Link>
            </div>

            <div className={styles.navArea}>
              <ul className={styles.navList}>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <div className={`${styles.navItem} ${item.active ? styles.navItemActive : ""}`}>
                        <Icon size={14} />
                        <span className={styles.navText}>{item.label}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className={styles.recentSection}>
                <p className={styles.recentTitle}>Recientes</p>
                <ul className={styles.recentList}>
                  {recentItems.map((item) => (
                    <li key={item} className={styles.recentItem}>
                      <Clock3 size={10} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className={styles.userDock}>
              <div className={styles.userExpanded}>
                <UserProfileMenu
                  name={userName}
                  email={userEmail}
                  hasAvatar={hasAvatar}
                  avatarVersion={avatarVersion}
                  dropdownDirection="up"
                  triggerVariant="sidebar-card"
                  showSidebarSettingsIcon
                />
              </div>
              <div className={styles.userCollapsed}>
                <UserProfileMenu
                  name={userName}
                  email={userEmail}
                  hasAvatar={hasAvatar}
                  avatarVersion={avatarVersion}
                  dropdownDirection="up"
                />
              </div>
            </div>
          </div>
        </aside>

        <div className={styles.workspace}>
          <header className={styles.mobileTopbar}>
            <button type="button" aria-label="Abrir sidebar" onClick={() => setMobileSidebarOpen(true)}>
              <Menu size={15} />
            </button>
            <BrandWordmark compact />
            <span className={styles.mobileTopbarPlaceholder} aria-hidden="true" />
          </header>

          {isConversationMode ? (
            <div className={styles.conversation}>
              <div className={styles.thread} ref={threadRef} onScroll={updateAutoScrollPreference} aria-live="polite">
                <div className={styles.threadMessages}>
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className={`${styles.message} ${message.role === "user" ? styles.messageUser : styles.messageAssistant}`}
                    >
                      <p>{message.content}</p>
                    </article>
                  ))}

                  {isAssistantThinking ? (
                    <article className={`${styles.message} ${styles.messageAssistant} ${styles.messageThinking}`} aria-label="Asistente pensando">
                      <span />
                      <span />
                      <span />
                    </article>
                  ) : null}

                  {isAssistantTyping ? (
                    <article className={`${styles.message} ${styles.messageAssistant}`}>
                      <p>
                        {typingText}
                        <i className={styles.caret} aria-hidden="true" />
                      </p>
                    </article>
                  ) : null}
                </div>
              </div>

              <div className={styles.composerDock}>
                <div className={styles.composerDockInner}>
                  <form className={`${styles.composer} ${styles.composerChat}`} onSubmit={handleSubmit}>
                    <label className="visually-hidden" htmlFor="chatbot-composer-input-active">
                      Escribe tu mensaje
                    </label>
                    <textarea
                      id="chatbot-composer-input-active"
                      ref={inputRef}
                      rows={2}
                      className={styles.composerTextarea}
                      value={draft}
                      onChange={(event) => {
                        setDraft(event.target.value);
                        if (selectedPrompt) setSelectedPrompt("");
                      }}
                      onKeyDown={handleInputKeyDown}
                      placeholder="Escribe tu consulta para el asistente..."
                    />
                    <div className={styles.composerFooter}>
                      <div className={styles.composerTools}>
                        <button type="button" className={styles.toolButton} aria-label="Agregar recurso">
                          <Plus size={15} />
                        </button>
                        <button type="button" className={styles.toolButton} aria-label="Adjuntar archivo">
                          <Paperclip size={14} />
                        </button>
                      </div>

                      <button className={styles.sendButton} type="submit" disabled={trimmedDraft.length === 0} aria-label="Enviar mensaje">
                        <ArrowUp size={14} />
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.landing}>
              <div className={styles.centerStack}>
                {showEmptyIntro ? (
                  <div className={styles.hero}>
                    <h1 className={styles.heroTitle}>Buenas noches, {greetingName}</h1>
                    <p className={styles.heroSubtitle}>Tu asistente de análisis táctico e inteligencia deportiva</p>
                  </div>
                ) : null}

                <div className={styles.composerStack}>
                  <form className={`${styles.composer} ${styles.composerEmpty}`} onSubmit={handleSubmit}>
                    <label className="visually-hidden" htmlFor="chatbot-composer-input">
                      Escribe tu mensaje
                    </label>
                    <textarea
                      id="chatbot-composer-input"
                      ref={inputRef}
                      rows={3}
                      className={styles.composerTextarea}
                      value={draft}
                      onChange={(event) => {
                        setDraft(event.target.value);
                        if (selectedPrompt) setSelectedPrompt("");
                      }}
                      onKeyDown={handleInputKeyDown}
                      placeholder="¿Cómo puedo ayudarte hoy?"
                    />
                    <div className={styles.composerFooter}>
                      <div className={styles.composerTools}>
                        <button type="button" className={styles.toolButton} aria-label="Agregar recurso">
                          <Plus size={16} />
                        </button>
                        <button type="button" className={styles.toolButton} aria-label="Adjuntar archivo">
                          <Paperclip size={14} />
                        </button>
                      </div>

                      {trimmedDraft.length === 0 ? (
                        <div className={styles.assistantPicker} aria-label="Seleccionar asistente">
                          <strong>Asistente táctico</strong>
                          <ChevronDown size={15} />
                          <AudioLines size={16} />
                        </div>
                      ) : (
                        <button className={styles.sendButton} type="submit" aria-label="Enviar mensaje">
                          <ArrowUp size={15} />
                        </button>
                      )}
                    </div>
                  </form>

                  {showStarterPrompts ? (
                    <div className={styles.suggestionGrid} aria-label="Sugerencias iniciales">
                      {starterPromptEntries.map(({ prompt, Icon }) => (
                        <button
                          key={prompt}
                          type="button"
                          className={`${styles.suggestionChip} ${selectedPrompt === prompt ? styles.suggestionChipSelected : ""}`}
                          onClick={() => applyStarterPrompt(prompt)}
                        >
                          <Icon size={13} />
                          <span>{prompt}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <p className={styles.privacyNote}>
                <span>◌</span> Tus datos están protegidos. DRIVXIS nunca comparte tu información.
              </p>
            </div>
          )}
        </div>
      </div>

      {mobileSidebarOpen ? (
        <button type="button" className={styles.overlay} aria-label="Cerrar sidebar" onClick={() => setMobileSidebarOpen(false)} />
      ) : null}
    </section>
  );
}
