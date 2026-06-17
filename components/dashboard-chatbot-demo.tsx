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
  Ellipsis,
  FileText,
  GitBranch,
  Menu,
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
import { FormEvent, KeyboardEvent, useEffect, useMemo, useReducer, useRef } from "react";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { getDemoAssistantResponse } from "@/lib/chatbot-demo";
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
type NavItemId = (typeof navItems)[number]["id"];

type ChatbotState = {
  messages: ChatMessage[];
  draft: string;
  hasSentFirstMessage: boolean;
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  assistantPhase: AssistantPhase;
  typingText: string;
  selectedPrompt: string;
  replyQueue: PendingReply[];
  activeReply: PendingReply | null;
  activeNavItem: NavItemId;
  openRecentMenuId: string | null;
  isMobileLayout: boolean;
};

type ChatbotAction =
  | { type: "patch"; changes: Partial<ChatbotState> }
  | { type: "update"; update: (state: ChatbotState) => Partial<ChatbotState> }
  | { type: "resetConversation"; activeNavItem: NavItemId };

const navItems = [
  { id: "new", label: "Nuevo chat", icon: Plus },
  { id: "search", label: "Buscar chat", icon: Search },
  { id: "season", label: "Temporadas", icon: CalendarDays },
  { id: "custom", label: "Personalizar", icon: SlidersHorizontal },
];

const recentItems = [
  { id: "recent-1", label: "Análisis táctico jornada 3" },
  { id: "recent-2", label: "Patrones de presión alta" },
  { id: "recent-3", label: "Transiciones defensivas vs Real" },
  { id: "recent-4", label: "Rendimiento mediocampo Q1" },
  { id: "recent-5", label: "Errores defensivos vs Saprissa" },
  { id: "recent-6", label: "Comparación entre extremos" },
] as const;

const starterPromptIcons = [Target, Activity, Bot, Users, GitBranch, FileText];
const starterPrompts = [
  "Análisis táctico",
  "Rendimiento físico",
  "Presión y posesión",
  "Comparar equipos",
  "Plan de juego",
  "Resumen del partido",
];

const INITIAL_CHATBOT_STATE: ChatbotState = {
  messages: [],
  draft: "",
  hasSentFirstMessage: false,
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  assistantPhase: "idle",
  typingText: "",
  selectedPrompt: "",
  replyQueue: [],
  activeReply: null,
  activeNavItem: "new",
  openRecentMenuId: null,
  isMobileLayout: false,
};

function chatbotReducer(state: ChatbotState, action: ChatbotAction): ChatbotState {
  if (action.type === "resetConversation") {
    return {
      ...state,
      messages: [],
      draft: "",
      hasSentFirstMessage: false,
      assistantPhase: "idle",
      typingText: "",
      selectedPrompt: "",
      replyQueue: [],
      activeReply: null,
      activeNavItem: action.activeNavItem,
    };
  }
  const changes = action.type === "update" ? action.update(state) : action.changes;
  return { ...state, ...changes };
}

function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`${styles.brandWordmark} ${compact ? styles.brandWordmarkCompact : ""}`} aria-label="DRIVXIS">
      <span>DRI</span>
      <span className={styles.brandWordmarkV}>V</span>
      <span>XIS</span>
    </span>
  );
}

type ChatbotSidebarProps = {
  state: ChatbotState;
  className: string;
  userName?: string | null;
  userEmail?: string | null;
  hasAvatar: boolean;
  avatarVersion?: string | null;
  dispatch: React.Dispatch<ChatbotAction>;
  onNavAction: (itemId: NavItemId) => void;
};

function ChatbotSidebar({
  state,
  className,
  userName,
  userEmail,
  hasAvatar,
  avatarVersion,
  dispatch,
  onNavAction,
}: ChatbotSidebarProps) {
  const { sidebarCollapsed, activeNavItem, openRecentMenuId } = state;
  return (
    <aside className={className} aria-label="Navegación de chatbot">
      <div className={styles.sidebarInner}>
        <div className={styles.mobileHeader}>
          <BrandWordmark compact />
          <button
            type="button"
            aria-label="Cerrar panel"
            onClick={() => dispatch({ type: "patch", changes: { mobileSidebarOpen: false } })}
          >
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
              className={`${styles.collapseButton} ${styles.collapsedTooltipTrigger}`}
              onClick={() =>
                dispatch({
                  type: "update",
                  update: (current) => ({ sidebarCollapsed: !current.sidebarCollapsed }),
                })
              }
              aria-label={sidebarCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
              data-tooltip={sidebarCollapsed ? "Abrir barra lateral" : "Cerrar barra lateral"}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            </button>
          </div>

          <Link href="/dashboard" className={`${styles.backLink} ${styles.collapsedTooltipTrigger}`} data-tooltip="Volver al dashboard">
            <span className={styles.backLinkIcon} aria-hidden="true">
              <ArrowLeft size={12} />
            </span>
            <span className={styles.backLinkLabel}>Volver al dashboard</span>
          </Link>
        </div>

        <div className={styles.navArea}>
          <ul className={styles.navList}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeNavItem === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`${styles.navItem} ${styles.collapsedTooltipTrigger} ${isActive ? styles.navItemActive : ""}`}
                    onClick={() => onNavAction(item.id)}
                    data-tooltip={item.label}
                  >
                    <Icon size={14} />
                    <span className={styles.navText}>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className={styles.recentSection}>
            <p className={styles.recentTitle}>Recientes</p>
            <ul className={styles.recentList}>
              {recentItems.map((item) => (
                <li key={item.id} className={styles.recentItem} data-recent-menu-root="true">
                  <button type="button" className={styles.recentRow}>
                    <Clock3 size={10} />
                    <span>{item.label}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.recentMenuButton}
                    aria-label={`Opciones para ${item.label}`}
                    aria-haspopup="menu"
                    aria-expanded={openRecentMenuId === item.id}
                    onClick={() =>
                      dispatch({
                        type: "update",
                        update: (current) => ({
                          openRecentMenuId: current.openRecentMenuId === item.id ? null : item.id,
                        }),
                      })
                    }
                  >
                    <Ellipsis size={12} />
                  </button>
                  {openRecentMenuId === item.id ? (
                    <ul className={styles.recentMenu} role="menu" aria-label={`Acciones para ${item.label}`}>
                      {["Editar nombre", "Eliminar", "Agregar a temporada"].map((label) => (
                        <li key={label}>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => dispatch({ type: "patch", changes: { openRecentMenuId: null } })}
                          >
                            {label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
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
  );
}

type ChatbotWorkspaceProps = {
  state: ChatbotState;
  greetingName: string;
  threadRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  dispatch: React.Dispatch<ChatbotAction>;
  onScroll: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onApplyPrompt: (prompt: string) => void;
};

function ChatbotWorkspace({
  state,
  greetingName,
  threadRef,
  inputRef,
  dispatch,
  onScroll,
  onSubmit,
  onInputKeyDown,
  onApplyPrompt,
}: ChatbotWorkspaceProps) {
  const {
    messages,
    draft,
    hasSentFirstMessage,
    assistantPhase,
    typingText,
    selectedPrompt,
    replyQueue,
    activeReply,
    isMobileLayout,
  } = state;
  const trimmedDraft = draft.trim();
  const isAssistantResponding = assistantPhase !== "idle" || activeReply !== null || replyQueue.length > 0;
  const showEmptyIntro = !hasSentFirstMessage && (!isMobileLayout || trimmedDraft.length === 0);
  const showStarterPrompts = !hasSentFirstMessage;
  const isAssistantThinking = assistantPhase === "thinking";
  const isAssistantTyping = assistantPhase === "typing";
  const isConversationMode = hasSentFirstMessage || messages.length > 0 || assistantPhase !== "idle";
  const landingClassName = [styles.landing, showEmptyIntro ? styles.landingIntro : styles.landingCompact].join(" ");

  return (
    <div className={styles.workspace}>
      <header className={styles.mobileTopbar}>
        <button
          type="button"
          aria-label="Abrir sidebar"
          onClick={() => dispatch({ type: "patch", changes: { mobileSidebarOpen: true } })}
        >
          <Menu size={15} />
        </button>
        <BrandWordmark compact />
        <span className={styles.mobileTopbarPlaceholder} aria-hidden="true" />
      </header>

      {isConversationMode ? (
        <div className={styles.conversation}>
          <div className={styles.thread} ref={threadRef} onScroll={onScroll} aria-live="polite">
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
              <form className={`${styles.composer} ${styles.composerChat}`} onSubmit={onSubmit}>
                <label className="visually-hidden" htmlFor="chatbot-composer-input-active">
                  Escribe tu mensaje
                </label>
                <textarea
                  id="chatbot-composer-input-active"
                  ref={inputRef}
                  rows={2}
                  className={styles.composerTextarea}
                  value={draft}
                  disabled={isAssistantResponding}
                  onChange={(event) => {
                    dispatch({
                      type: "patch",
                      changes: { draft: event.target.value, selectedPrompt: "" },
                    });
                  }}
                  onKeyDown={onInputKeyDown}
                  placeholder="Escribe tu consulta para el asistente..."
                />
                <ComposerFooter
                  canSend={trimmedDraft.length > 0 && !isAssistantResponding}
                  submitAlways
                />
              </form>
            </div>
          </div>
        </div>
      ) : (
        <div className={landingClassName}>
          <div className={styles.centerStack}>
            {showEmptyIntro ? (
              <div className={styles.hero}>
                <h1 className={styles.heroTitle}>Buenas noches, {greetingName}</h1>
                <p className={styles.heroSubtitle}>Tu asistente de análisis táctico e inteligencia deportiva</p>
              </div>
            ) : null}

            <div className={styles.composerStack}>
              <form className={`${styles.composer} ${styles.composerEmpty}`} onSubmit={onSubmit}>
                <label className="visually-hidden" htmlFor="chatbot-composer-input">
                  Escribe tu mensaje
                </label>
                <textarea
                  id="chatbot-composer-input"
                  ref={inputRef}
                  rows={3}
                  className={styles.composerTextarea}
                  value={draft}
                  disabled={isAssistantResponding}
                  onChange={(event) => {
                    dispatch({
                      type: "patch",
                      changes: { draft: event.target.value, selectedPrompt: "" },
                    });
                  }}
                  onKeyDown={onInputKeyDown}
                  placeholder="¿Cómo puedo ayudarte hoy?"
                />
                <ComposerFooter canSend={trimmedDraft.length > 0 && !isAssistantResponding} />
              </form>

              {showStarterPrompts ? (
                <div className={styles.suggestionGrid} aria-label="Sugerencias iniciales">
                  {starterPrompts.map((prompt, index) => {
                    const Icon = starterPromptIcons[index % starterPromptIcons.length];
                    return (
                      <button
                        key={prompt}
                        type="button"
                        className={`${styles.suggestionChip} ${selectedPrompt === prompt ? styles.suggestionChipSelected : ""}`}
                        onClick={() => onApplyPrompt(prompt)}
                      >
                        <Icon size={13} />
                        <span>{prompt}</span>
                      </button>
                    );
                  })}
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
  );
}

function ComposerFooter({ canSend, submitAlways = false }: { canSend: boolean; submitAlways?: boolean }) {
  return (
    <div className={styles.composerFooter}>
      <div className={styles.composerTools}>
        <button type="button" className={styles.toolButton} aria-label="Agregar recurso">
          <Plus size={15} />
        </button>
        <button type="button" className={styles.toolButton} aria-label="Adjuntar archivo">
          <Paperclip size={14} />
        </button>
      </div>
      {canSend || submitAlways ? (
        <button className={styles.sendButton} type="submit" disabled={!canSend} aria-label="Enviar mensaje">
          <ArrowUp size={14} />
        </button>
      ) : (
        <div className={styles.assistantPicker} aria-label="Seleccionar asistente">
          <strong>Asistente táctico</strong>
          <ChevronDown size={15} />
          <AudioLines size={16} />
        </div>
      )}
    </div>
  );
}

export function DashboardChatbotDemo({
  userName,
  userEmail,
  hasAvatar = false,
  avatarVersion = null,
}: DashboardChatbotDemoProps) {
  const [chatbotState, dispatchChatbot] = useReducer(chatbotReducer, INITIAL_CHATBOT_STATE);
  const {
    messages,
    draft,
    hasSentFirstMessage,
    sidebarCollapsed,
    mobileSidebarOpen,
    assistantPhase,
    typingText,
    selectedPrompt,
    replyQueue,
    activeReply,
    activeNavItem,
    openRecentMenuId,
    isMobileLayout,
  } = chatbotState;

  const messageCounterRef = useRef(0);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoScrollEnabledRef = useRef(true);
  const previousAssistantPhaseRef = useRef<AssistantPhase>("idle");

  const trimmedDraft = draft.trim();
  const isAssistantResponding = assistantPhase !== "idle" || activeReply !== null || replyQueue.length > 0;
  const isAssistantTyping = assistantPhase === "typing";
  const isDesktopSidebarCollapsed = sidebarCollapsed && !isMobileLayout;

  const rootClassName = [styles.shell, isDesktopSidebarCollapsed ? styles.sidebarCollapsed : ""].filter(Boolean).join(" ");
  const sidebarClassName = [styles.sidebar, mobileSidebarOpen ? styles.sidebarMobileOpen : ""].filter(Boolean).join(" ");

  const greetingName = useMemo(() => {
    const source = (userName || "Carlos").trim();
    if (source.length === 0) return "Carlos";
    return source.split(/\s+/)[0] || "Carlos";
  }, [userName]);

  useEffect(() => {
    if (activeReply || replyQueue.length === 0) return;
    dispatchChatbot({
      type: "update",
      update: (current) => ({
        activeReply: current.replyQueue[0] ?? null,
        replyQueue: current.replyQueue.slice(1),
      }),
    });
  }, [activeReply, replyQueue]);

  useEffect(() => {
    if (!activeReply) return;

    let typingInterval: ReturnType<typeof setInterval> | null = null;
    let thinkingTimeout: ReturnType<typeof setTimeout> | null = null;
    let cursor = 0;

    dispatchChatbot({ type: "patch", changes: { assistantPhase: "thinking", typingText: "" } });

    thinkingTimeout = setTimeout(() => {
      dispatchChatbot({ type: "patch", changes: { assistantPhase: "typing" } });

      typingInterval = setInterval(() => {
        const chunk = Math.max(1, Math.min(4, Math.floor(Math.random() * 4) + 1));
        cursor = Math.min(activeReply.content.length, cursor + chunk);
        dispatchChatbot({ type: "patch", changes: { typingText: activeReply.content.slice(0, cursor) } });

        if (cursor < activeReply.content.length) return;

        if (typingInterval) {
          clearInterval(typingInterval);
          typingInterval = null;
        }

        dispatchChatbot({
          type: "update",
          update: (current) => ({
            messages: [
              ...current.messages,
              {
                id: activeReply.id,
                role: "assistant",
                content: activeReply.content,
              },
            ],
            typingText: "",
            assistantPhase: "idle",
            activeReply: null,
          }),
        });
      }, 26);
    }, 320);

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

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const updateIsMobile = (event?: MediaQueryListEvent) => {
      dispatchChatbot({ type: "patch", changes: { isMobileLayout: event ? event.matches : mediaQuery.matches } });
    };
    updateIsMobile();
    mediaQuery.addEventListener("change", updateIsMobile);
    return () => mediaQuery.removeEventListener("change", updateIsMobile);
  }, []);

  useEffect(() => {
    if (!isMobileLayout && mobileSidebarOpen) {
      dispatchChatbot({ type: "patch", changes: { mobileSidebarOpen: false } });
    }
  }, [isMobileLayout, mobileSidebarOpen]);

  useEffect(() => {
    const previousPhase = previousAssistantPhaseRef.current;
    previousAssistantPhaseRef.current = assistantPhase;

    const finishedTyping = previousPhase === "typing" && assistantPhase === "idle" && !isAssistantResponding;
    if (!finishedTyping || isMobileLayout) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [assistantPhase, isAssistantResponding, isMobileLayout]);

  useEffect(() => {
    if (!openRecentMenuId) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("[data-recent-menu-root='true']")) return;
      dispatchChatbot({ type: "patch", changes: { openRecentMenuId: null } });
    }
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") dispatchChatbot({ type: "patch", changes: { openRecentMenuId: null } });
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openRecentMenuId]);

  function nextMessageId(role: ChatMessage["role"]) {
    messageCounterRef.current += 1;
    return `${role}-${Date.now()}-${messageCounterRef.current}`;
  }

  function queueAssistantReply(message: string) {
    const response = getDemoAssistantResponse(message);
    const reply = { id: nextMessageId("assistant"), content: response };
    dispatchChatbot({
      type: "update",
      update: (current) => ({ replyQueue: [...current.replyQueue, reply] }),
    });
  }

  function updateAutoScrollPreference() {
    const thread = threadRef.current;
    if (!thread) return;
    const distanceToBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
    autoScrollEnabledRef.current = distanceToBottom <= 120;
  }

  function sendMessage() {
    if (trimmedDraft.length === 0 || isAssistantResponding) return;

    const outbound = trimmedDraft;
    dispatchChatbot({
      type: "update",
      update: (current) => ({
        messages: [
          ...current.messages,
          {
            id: nextMessageId("user"),
            role: "user",
            content: outbound,
          },
        ],
        hasSentFirstMessage: true,
        draft: "",
        selectedPrompt: "",
        mobileSidebarOpen: false,
      }),
    });
    queueAssistantReply(outbound);
    autoScrollEnabledRef.current = true;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isAssistantResponding) {
      event.preventDefault();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    sendMessage();
  }

  function applyStarterPrompt(prompt: string) {
    dispatchChatbot({
      type: "patch",
      changes: { selectedPrompt: prompt, draft: prompt, mobileSidebarOpen: false },
    });
  }

  function handleNavAction(itemId: NavItemId) {
    if (itemId === "new") {
      dispatchChatbot({ type: "resetConversation", activeNavItem: itemId });
      autoScrollEnabledRef.current = true;
      return;
    }
    dispatchChatbot({ type: "patch", changes: { activeNavItem: itemId } });
  }

  return (
    <section className={rootClassName}>
      <div className={styles.layout}>
        <ChatbotSidebar
          state={chatbotState}
          className={sidebarClassName}
          userName={userName}
          userEmail={userEmail}
          hasAvatar={hasAvatar}
          avatarVersion={avatarVersion}
          dispatch={dispatchChatbot}
          onNavAction={handleNavAction}
        />

        <ChatbotWorkspace
          state={chatbotState}
          greetingName={greetingName}
          threadRef={threadRef}
          inputRef={inputRef}
          dispatch={dispatchChatbot}
          onScroll={updateAutoScrollPreference}
          onSubmit={handleSubmit}
          onInputKeyDown={handleInputKeyDown}
          onApplyPrompt={applyStarterPrompt}
        />
      </div>

      {mobileSidebarOpen ? (
        <button
          type="button"
          className={styles.overlay}
          aria-label="Cerrar sidebar"
          onClick={() => dispatchChatbot({ type: "patch", changes: { mobileSidebarOpen: false } })}
        />
      ) : null}
    </section>
  );
}
