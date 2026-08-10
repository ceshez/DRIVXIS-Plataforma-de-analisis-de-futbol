"use client";

import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  ClipboardCheck,
  Clock3,
  Copy,
  Eye,
  Filter,
  Info,
  Loader2,
  Menu,
  RotateCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { AnnotationLine, CornerMarks, MicroGrid } from "@/components/micro-graphics";
import styles from "./ux-ui-demo.module.css";

type ToastTone = "success" | "warning" | "error";
type ToastState = {
  id: number;
  tone: ToastTone;
  title: string;
  message: string;
};

const matrixRows = [
  {
    pattern: "Inline validation",
    use: "Cuando el problema pertenece a un campo concreto.",
    avoid: "Errores globales o procesos asincronos.",
    example: "Correo requerido, formato de archivo incorrecto.",
  },
  {
    pattern: "Toast",
    use: "Confirmaciones breves y no bloqueantes.",
    avoid: "Errores criticos, instrucciones largas o validacion de formularios.",
    example: "Video copiado, reporte guardado.",
  },
  {
    pattern: "Banner",
    use: "Estado persistente de pagina o seccion.",
    avoid: "Decisiones que requieren bloqueo.",
    example: "Storage casi lleno, modo sin conexion.",
  },
  {
    pattern: "Modal",
    use: "Confirmar una accion riesgosa o resolver una decision obligatoria.",
    avoid: "Avisos informativos o recuperables inline.",
    example: "Eliminar analisis, descartar cambios.",
  },
];

const galleryTabs = [
  { id: "familiar", label: "Patrones familiares" },
  { id: "feedback", label: "Feedback" },
  { id: "forms", label: "Formularios" },
];

const statusStates = [
  { icon: CircleDashed, title: "Empty state", text: "No hay clips con este filtro. Ofrece una accion clara para continuar." },
  { icon: Loader2, title: "Loading", text: "Muestra progreso sin cambiar el layout ni bloquear zonas no afectadas." },
  { icon: XCircle, title: "Error", text: "Explica el problema y ofrece reintento, soporte o una ruta alternativa." },
  { icon: CheckCircle2, title: "Success", text: "Confirma el resultado sin interrumpir el flujo principal." },
];

const reviewItems = [
  "Accion principal visible",
  "Errores recuperables",
  "Estados vacio/loading/error",
  "Navegacion predecible",
  "Controles con labels",
  "Feedback accesible",
];

function getToastIcon(tone: ToastTone) {
  if (tone === "success") return CheckCircle2;
  if (tone === "warning") return AlertTriangle;
  return XCircle;
}

export function UxUiDemoGallery() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [activeTab, setActiveTab] = useState(galleryTabs[0].id);
  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState("analista@club");
  const [team, setTeam] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [compactMode, setCompactMode] = useState(true);
  const modalCloseRef = useRef<HTMLButtonElement>(null);

  const errors = useMemo(() => {
    const next: { email?: string; team?: string } = {};
    if (!email.trim()) next.email = "Ingresa el correo del analista.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Usa un correo con formato nombre@club.com.";
    if (!team.trim()) next.team = "Escribe el nombre del equipo para asociar el reporte.";
    return next;
  }, [email, team]);

  const showErrors = submitted && Object.keys(errors).length > 0;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (modalOpen) modalCloseRef.current?.focus();
  }, [modalOpen]);

  function showToast(tone: ToastTone, title: string, message: string) {
    setToast({ id: Date.now(), tone, title, message });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    showToast("success", "Reporte preparado", "La configuracion se guardo para el proximo analisis.");
  }

  const ToastIcon = toast ? getToastIcon(toast.tone) : null;

  function renderGallery() {
    return (
    <main className={styles.page}>
      <MicroGrid />
      <header className={styles.header}>
        <Link className={styles.backLink} href="/">
          <ArrowLeft size={15} />
          Volver
        </Link>
        <nav className={styles.nav} aria-label="Secciones de galeria UX">
          <a href="#decision">Decision</a>
          <a href="#feedback">Feedback</a>
          <a href="#forms">Formularios</a>
          <a href="#states">Estados</a>
        </nav>
        <span className={styles.liveChip}>
          <span />
          UX/UI demo
        </span>
      </header>

      <section className={styles.hero}>
        <CornerMarks size={18} opacity={0.38} />
        <div className={styles.heroCopy}>
          <span className={styles.systemBadge}>DRIVXIS skill gallery / UX primitives</span>
          <h1>
            Galeria de patrones <span>UX/UI</span>
          </h1>
          <p>
            Una pagina de demostracion para ver como se aplican patrones familiares, feedback,
            validacion, recuperacion de errores y componentes accesibles dentro del sistema visual DRIVXIS.
          </p>
        </div>
        <div className={styles.heroPanel} aria-label="Resumen de reglas UX">
          <AnnotationLine label="checklist" value="06 / criterios" />
          <div className={styles.checkGrid}>
            {reviewItems.map((item) => (
              <span key={item}>
                <CheckCircle2 size={14} />
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Resumen de criterios">
        {[
          ["01", "Familiaridad", "Usar patrones que los usuarios ya reconocen."],
          ["02", "Contexto", "El feedback vive cerca del problema."],
          ["03", "Recuperacion", "Cada error tiene salida clara."],
          ["04", "Accesibilidad", "Teclado, foco, texto y live regions."],
        ].map(([value, title, text]) => (
          <article className={styles.metric} key={title}>
            <strong>{value}</strong>
            <span>{title}</span>
            <p>{text}</p>
          </article>
        ))}
      </section>

      <section className={styles.section} id="decision">
        <div className={styles.sectionHead}>
          <AnnotationLine label="seccion" value="01 / matriz" />
          <h2>Decidir el patron correcto</h2>
          <p>La skill prioriza severidad, persistencia y accion requerida antes de elegir un componente.</p>
        </div>
        <table className={styles.matrix} aria-label="Matriz de decision UX">
          <thead>
            <tr className={`${styles.matrixRow} ${styles.matrixHeader}`}>
              <th>Patron</th>
              <th>Usar cuando</th>
              <th>Evitar cuando</th>
              <th>Ejemplo</th>
            </tr>
          </thead>
          <tbody>
          {matrixRows.map((row) => (
            <tr className={styles.matrixRow} key={row.pattern}>
              <th scope="row">{row.pattern}</th>
              <td>{row.use}</td>
              <td>{row.avoid}</td>
              <td>{row.example}</td>
            </tr>
          ))}
          </tbody>
        </table>
      </section>

      <section className={styles.section} id="feedback">
        <div className={styles.sectionHead}>
          <AnnotationLine label="seccion" value="02 / feedback" />
          <h2>Feedback: toast, banner y modal</h2>
          <p>La misma situacion no siempre necesita el mismo tratamiento visual.</p>
        </div>

        <div className={styles.feedbackGrid}>
          <article className={styles.panel}>
            <div className={styles.panelTop}>
              <Bell size={18} />
              <div>
                <h3>Toast no bloqueante</h3>
                <p>Para confirmaciones pequenas o eventos perifericos.</p>
              </div>
            </div>
            <div className={styles.actionRow}>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={() => showToast("success", "Video copiado", "El enlace esta listo para compartir.")}
              >
                <Copy size={15} />
                Copiar enlace
              </button>
              <button
                className={styles.ghostButton}
                type="button"
                onClick={() => showToast("warning", "Sincronizacion lenta", "El reporte seguira procesandose en segundo plano.")}
              >
                <Clock3 size={15} />
                Simular aviso
              </button>
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.banner} role="status">
              <Info size={18} />
              <div>
                <strong>Storage al 82%</strong>
                <span>Banner persistente porque afecta esta seccion y puede requerir accion.</span>
              </div>
              <button className={styles.textButton} type="button">
                Revisar
                <ChevronRight size={14} />
              </button>
            </div>
            <div className={styles.miniNote}>
              Un banner no desaparece solo cuando la informacion sigue importando despues de unos segundos.
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelTop}>
              <ShieldAlert size={18} />
              <div>
                <h3>Modal de confirmacion</h3>
                <p>Para acciones destructivas, costosas o dificiles de revertir.</p>
              </div>
            </div>
            <button className={styles.dangerButton} type="button" onClick={() => setModalOpen(true)}>
              <Trash2 size={15} />
              Eliminar analisis
            </button>
          </article>
        </div>
      </section>

      <section className={styles.section} id="forms">
        <div className={styles.sectionHead}>
          <AnnotationLine label="seccion" value="03 / formularios" />
          <h2>Formularios con recuperacion</h2>
          <p>Los errores viven junto al campo, preservan datos y explican el siguiente paso.</p>
        </div>

        <div className={styles.formLayout}>
          <form className={styles.formPanel} onSubmit={handleSubmit} noValidate>
            {showErrors ? (
              <div className={styles.errorSummary} role="alert" aria-labelledby="summary-title">
                <AlertTriangle size={18} />
                <div>
                  <strong id="summary-title">Revisa {Object.keys(errors).length} campo(s)</strong>
                  <span>Corrige los campos marcados antes de preparar el reporte.</span>
                </div>
              </div>
            ) : null}

            <label className={styles.field}>
              <span>Correo del analista</span>
              <input
                aria-describedby={showErrors && errors.email ? "email-error" : "email-help"}
                aria-invalid={Boolean(showErrors && errors.email)}
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              {showErrors && errors.email ? (
                <small className={styles.fieldError} id="email-error">
                  {errors.email}
                </small>
              ) : (
                <small id="email-help">Usa el correo donde el cuerpo tecnico recibira avisos.</small>
              )}
            </label>

            <label className={styles.field}>
              <span>Equipo asociado</span>
              <input
                aria-describedby={showErrors && errors.team ? "team-error" : "team-help"}
                aria-invalid={Boolean(showErrors && errors.team)}
                name="team"
                placeholder="Academia Norte FC"
                value={team}
                onChange={(event) => setTeam(event.target.value)}
              />
              {showErrors && errors.team ? (
                <small className={styles.fieldError} id="team-error">
                  {errors.team}
                </small>
              ) : (
                <small id="team-help">Este nombre aparecera en la biblioteca y reportes.</small>
              )}
            </label>

            <div className={styles.formControls}>
              <label className={styles.checkControl}>
                <input type="checkbox" defaultChecked />
                <span>Enviar confirmacion al finalizar</span>
              </label>
              <label className={styles.selectField}>
                <span>Prioridad</span>
                <select defaultValue="normal">
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="low">Baja</option>
                </select>
              </label>
            </div>

            <button className={styles.primaryButton} type="submit">
              <ClipboardCheck size={15} />
              Preparar reporte
            </button>
          </form>

          <aside className={styles.patternPanel}>
            <h3>Patrones familiares</h3>
            <div className={styles.tabs} role="tablist" aria-label="Patrones de interfaz">
              {galleryTabs.map((tab) => (
                <button
                  aria-selected={activeTab === tab.id}
                  className={activeTab === tab.id ? styles.activeTab : undefined}
                  key={tab.id}
                  role="tab"
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className={styles.tabPanel} role="tabpanel">
              {activeTab === "familiar" ? (
                <div className={styles.toolbarDemo}>
                  <button type="button">
                    <Menu size={15} />
                    Menu
                  </button>
                  <button type="button">
                    <Search size={15} />
                    Buscar
                  </button>
                  <button type="button">
                    <Filter size={15} />
                    Filtrar
                  </button>
                </div>
              ) : null}
              {activeTab === "feedback" ? (
                <div className={styles.undoDemo}>
                  <RotateCcw size={16} />
                  <span>Accion reversible: mostrar undo antes de pedir confirmacion.</span>
                </div>
              ) : null}
              {activeTab === "forms" ? (
                <div className={styles.switchRow}>
                  <span>Modo compacto</span>
                  <button
                    aria-label={compactMode ? "Desactivar modo compacto" : "Activar modo compacto"}
                    aria-pressed={compactMode}
                    className={compactMode ? styles.switchOn : styles.switchOff}
                    type="button"
                    onClick={() => setCompactMode((current) => !current)}
                  >
                    <span />
                  </button>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </section>

      <section className={styles.section} id="states">
        <div className={styles.sectionHead}>
          <AnnotationLine label="seccion" value="04 / estados" />
          <h2>Estados que la interfaz debe contemplar</h2>
          <p>Una pantalla madura no solo disena el caso ideal; tambien cubre ausencia, espera, fallo y exito.</p>
        </div>
        <div className={styles.stateGrid}>
          {statusStates.map((state, index) => {
            const Icon = state.icon;
            return (
              <article className={styles.statePanel} key={state.title}>
                <span className={styles.stateIndex}>{String(index + 1).padStart(2, "0")}</span>
                <Icon className={state.title === "Loading" ? styles.spin : undefined} size={22} />
                <h3>{state.title}</h3>
                <p>{state.text}</p>
                {state.title === "Loading" ? (
                  <span className={styles.skeleton}>
                    <span />
                    <span />
                    <span />
                  </span>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <AnnotationLine label="seccion" value="05 / producto" />
          <h2>Ejemplo aplicado a DRIVXIS</h2>
          <p>Un bloque denso, tecnico y escaneable para usuarios de analisis deportivo.</p>
        </div>
        <div className={styles.productDemo}>
          <div className={styles.pitch}>
            <span className={styles.pitchLine} />
            <span className={styles.pitchCircle} />
            {["18%", "34%", "48%", "64%", "78%"].map((left, index) => (
              <span
                className={styles.player}
                key={left}
                style={{ "--x": left, "--y": `${24 + index * 12}%` } as CSSProperties}
              />
            ))}
          </div>
          <div className={styles.dataStack}>
            {[
              ["Presion alta", "72%", "success"],
              ["Riesgo defensivo", "18%", "warning"],
              ["Tracking perdido", "02", "error"],
            ].map(([label, value, tone]) => (
              <div className={styles.dataRow} key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <i className={styles[tone as "success" | "warning" | "error"]} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>DRIVXIS / UX skill gallery</span>
        <Link href="/login">Ir al login</Link>
      </footer>

      {toast && ToastIcon ? (
        <div className={styles.toastStack} aria-live="polite" aria-atomic="true">
          <output className={`${styles.toast} ${styles[`toast_${toast.tone}`]}`} key={toast.id}>
            <ToastIcon size={18} />
            <span>
              <strong>{toast.title}</strong>
              <small>{toast.message}</small>
            </span>
            <button type="button" aria-label="Cerrar notificacion" onClick={() => setToast(null)}>
              <X size={14} />
            </button>
          </output>
        </div>
      ) : null}

      {modalOpen ? (
        <dialog
          open
          className={styles.modalBackdrop}
            aria-labelledby="delete-title"
            aria-describedby="delete-copy"
        >
          <div className={styles.modal}>
            <button
              ref={modalCloseRef}
              className={styles.modalClose}
              type="button"
              aria-label="Cerrar modal"
              onClick={() => setModalOpen(false)}
            >
              <X size={16} />
            </button>
            <ShieldAlert size={24} />
            <h2 id="delete-title">Eliminar analisis del partido</h2>
            <p id="delete-copy">
              Esta accion retiraria el reporte, sus metricas y snapshots asociados. El texto del boton
              nombra la accion exacta para evitar confirmaciones ambiguas.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.ghostButton} type="button" onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button
                className={styles.dangerButton}
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  showToast("error", "Demo: accion bloqueada", "En produccion aqui se ejecutaria una eliminacion confirmada.");
                }}
              >
                Eliminar analisis
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </main>
    );
  }

  return renderGallery();
}
