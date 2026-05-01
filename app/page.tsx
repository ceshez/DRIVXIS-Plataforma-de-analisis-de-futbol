import Link from "next/link";
import { ArrowRight, BarChart2, ChevronRight, Cpu, FileVideo, TrendingUp } from "lucide-react";
import { AnnotationLine, CornerMarks, Crosshair, MicroGrid } from "@/components/micro-graphics";
import { SiteHeader } from "@/components/site-header";

const processSteps = [
  {
    step: "01",
    title: "Carga del video",
    text: "Sube footage del partido en formatos estándar desde dron, cámara fija o dispositivo móvil.",
    icon: FileVideo,
  },
  {
    step: "02",
    title: "Detección con IA",
    text: "El modelo identifica jugadores, árbitros y balón fotograma a fotograma con precisión sub-píxel.",
    icon: Cpu,
  },
  {
    step: "03",
    title: "Extracción de datos",
    text: "Calcula trayectorias, velocidades, zonas de acción, presión defensiva y posesión.",
    icon: TrendingUp,
  },
  {
    step: "04",
    title: "Reporte táctico",
    text: "Presenta mapas, gráficos y comparativas listas para cuerpo técnico y scouting.",
    icon: BarChart2,
  },
];

const capabilities = [
  {
    title: "Tracking posicional",
    value: "99.2%",
    label: "precisión de detección",
    text: "Identifica la posición exacta de cada jugador y construye trayectorias continuas durante el partido.",
  },
  {
    title: "Análisis físico",
    value: "40+",
    label: "métricas por jugador",
    text: "Distancia, velocidades, sprints, esfuerzos de alta intensidad y zonas de carga estimada.",
  },
  {
    title: "Inteligencia táctica",
    value: "4-3-3",
    label: "formación detectada",
    text: "Infiere líneas defensivas, bloque de presión y transiciones ofensivas sin marcaje manual.",
  },
  {
    title: "Eventos clave",
    value: "<2s",
    label: "marcaje automatico",
    text: "Detecta goles, remates, pases clave, duelos, pérdidas y situaciones de riesgo defensivo.",
  },
];

const techMetrics = [
  { label: "Velocidad de procesamiento", value: 94 },
  { label: "Precisión de detección", value: 99 },
  { label: "Métricas por análisis", value: 78 },
  { label: "Cobertura de eventos", value: 87 },
];

const testimonials = [
  {
    quote: "DRIVXIS nos dio acceso a datos que antes requerían un equipo de analistas. Ahora los tenemos en minutos.",
    name: "Carlos Mendoza",
    role: "Director técnico, Club Atlético Norte",
  },
  {
    quote: "La visualización táctica es precisa y clara. Integramos el sistema en scouting sin fricciones.",
    name: "Sofia Reyes",
    role: "Coordinadora de análisis, Academia Sur FC",
  },
];

const tacticalPlayers = [
  { team: "home", label: "DX", left: "18%", top: "50%" },
  { team: "home", label: "DF", left: "31%", top: "31%" },
  { team: "home", label: "DF", left: "31%", top: "45%" },
  { team: "home", label: "DF", left: "31%", top: "61%" },
  { team: "home", label: "DF", left: "31%", top: "76%" },
  { team: "home", label: "MC", left: "47%", top: "38%" },
  { team: "home", label: "MC", left: "47%", top: "50%" },
  { team: "home", label: "MC", left: "47%", top: "68%" },
  { team: "home", label: "DC", left: "64%", top: "50%" },
  { team: "home", label: "EX", left: "64%", top: "31%" },
  { team: "home", label: "EX", left: "64%", top: "76%" },
  { team: "away", label: "", left: "51%", top: "31%" },
  { team: "away", label: "", left: "51%", top: "50%" },
  { team: "away", label: "", left: "51%", top: "76%" },
  { team: "away", label: "", left: "68%", top: "38%" },
  { team: "away", label: "", left: "68%", top: "50%" },
  { team: "away", label: "", left: "68%", top: "68%" },
  { team: "away", label: "", left: "84%", top: "31%" },
  { team: "away", label: "", left: "84%", top: "50%" },
  { team: "away", label: "", left: "84%", top: "76%" },
  { team: "away", label: "", left: "96%", top: "50%" },
];

export default function HomePage() {
  return (
    <main className="site-shell">
      <SiteHeader
        navItems={[
          { href: "#inicio", label: "Inicio" },
          { href: "#proceso", label: "Proceso" },
          { href: "#capacidades", label: "Capacidades" },
          { href: "#contacto", label: "Contacto" },
        ]}
        action={
          <>
            <span className="live-chip live-chip--small">
              <span />
              En línea
            </span>
            <Link className="button primary" href="/login">
              Iniciar sesión
            </Link>
          </>
        }
      />

      <section className="hero-section" id="inicio">
        <MicroGrid />
        <span className="hero-glow" />
        <Crosshair className="hero-crosshair hero-crosshair--one" size={28} opacity={0.22} />
        <Crosshair className="hero-crosshair hero-crosshair--two" size={18} opacity={0.16} />
        <div className="axis-line axis-line--left" />
        <div className="axis-line axis-line--right" />

        <div className="hero-copy">
          <div className="system-badge">
            <span />
            Football intelligence system / v2.1
          </div>
          <h1>
            DRI<span>V</span>XIS
          </h1>
          <p className="hero-kicker">Análisis táctico con inteligencia artificial</p>
          <p className="hero-lead">
            Convierte cualquier grabación de partido en datos tácticos y físicos procesables.
            Diseñado para cuerpos técnicos que trabajan con evidencia.
          </p>
          <div className="hero-actions">
            <Link className="button primary command-button" href="/register">
              Comenzar análisis
              <ArrowRight size={14} />
            </Link>
            <a className="button ghost command-button" href="#proceso">
              Ver proceso
              <ChevronRight size={14} />
            </a>
          </div>
        </div>

        <div className="scroll-indicator" aria-hidden="true">
          <span />
          Scroll
        </div>
      </section>

      <section className="metrics-band" aria-label="Métricas de plataforma">
        <MicroGrid />
        {[
          { value: "40+", label: "Métricas por partido" },
          { value: "99.2%", label: "Precisión de detección" },
          { value: "<5min", label: "Tiempo de procesamiento" },
          { value: "24/7", label: "Acceso al sistema" },
        ].map((metric) => (
          <article className="metric-tile" key={metric.label}>
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </article>
        ))}
      </section>

      <section className="section-block" id="proceso">
        <MicroGrid />
        <div className="section-heading">
          <AnnotationLine label="seccion" value="02 / PROCESO" />
          <h2>
            Cómo funciona<span>.</span>
          </h2>
          <p>Un pipeline automatizado transforma video crudo en inteligencia táctica en menos de cinco minutos.</p>
        </div>

        <div className="process-grid">
          {processSteps.map((step) => {
            const Icon = step.icon;
            return (
              <article className="process-card" key={step.step}>
                <div className="process-card__icon">
                  <Icon size={20} />
                  <span>{step.step}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section-block section-block--bordered" id="capacidades">
        <MicroGrid />
        <div className="section-heading">
          <div>
            <AnnotationLine label="seccion" value="03 / CAPACIDADES" />
            <h2>
              Qué analiza<span>.</span>
            </h2>
          </div>
        </div>

        <div className="capability-grid">
          {capabilities.map((capability, index) => (
            <article className="capability-card" key={capability.title}>
              <CornerMarks size={10} opacity={0.25} />
              <div className="capability-card__top">
                <h3>{capability.title}</h3>
                <b>{String(index + 1).padStart(2, "0")}</b>
              </div>
              <div>
                <strong>{capability.value}</strong>
                <span>{capability.label}</span>
              </div>
              <p>{capability.text}</p>
            </article>
          ))}
        </div>

        <div className="tech-panel">
          <CornerMarks size={12} opacity={0.35} />
          <h3>Indicadores técnicos del sistema</h3>
          <div className="tech-bars">
            {techMetrics.map((metric) => (
              <div className="tech-bar" key={metric.label}>
                <div>
                  <span>{metric.label}</span>
                  <strong>{metric.value}%</strong>
                </div>
                <span className="meter">
                  <span style={{ width: `${metric.value}%` }} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="visual-section">
        <div className="visual-copy">
          <AnnotationLine label="visualización" value="04 / RADAR" />
          <h2>
            Campo táctico en tiempo real<span>.</span>
          </h2>
          <p>
            Cada análisis genera un mapa táctico interactivo: formaciones, zonas de acción, líneas
            defensivas y movimientos colectivos por tramo.
          </p>
          <div className="feature-list">
            {["Formación automática", "Heatmaps individuales", "Líneas y bloques", "Control territorial"].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>

        <div className="field-visual">
          <CornerMarks size={14} opacity={0.4} />
          <MicroGrid />
          <div className="video-radar__field">
            <span className="field-midline" />
            <span className="field-circle" />
            <span className="field-box field-box--left" />
            <span className="field-box field-box--right" />
            <span className="field-measure field-measure--right">54 m</span>
            <span className="field-measure field-measure--bottom">52.5 m</span>
            <span className="ball-marker" style={{ left: "57%", top: "50%" }} />
            {tacticalPlayers.map((player, index) => (
              <span
                className={`player-marker ${player.team}`}
                data-label={player.label}
                key={`${player.team}-${index}`}
                style={{ left: player.left, top: player.top }}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="testimonial-section">
        {testimonials.map((testimonial) => (
          <article className="testimonial-card" key={testimonial.name}>
            <p>{testimonial.quote}</p>
            <strong>{testimonial.name}</strong>
            <span>{testimonial.role}</span>
          </article>
        ))}
      </section>

      <section className="final-cta" id="contacto">
        <h2>Empieza a analizar tu próximo partido</h2>
        <p>Inicia sesión para acceder al módulo de análisis. Sin instalaciones, sin hardware adicional.</p>
        <Link className="button primary command-button" href="/login">
          Entrar al sistema
          <ArrowRight size={14} />
        </Link>
      </section>

      <footer className="site-footer">
        <span className="footer-brand">
          <img src="/logos/drivxis-logo-claro.svg" alt="DRIVXIS" />
        </span>
        <span>2026 / Football intelligence system</span>
        <div>
          <a href="#inicio">Privacidad</a>
          <a href="#inicio">Términos</a>
          <a href="#inicio">Contacto</a>
        </div>
      </footer>
    </main>
  );
}
