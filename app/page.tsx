"use client";

import Link from "next/link";
import { ArrowRight, BarChart2, ChevronRight, Cpu, FileVideo, TrendingUp } from "lucide-react";
import { AnnotationLine, CornerMarks, Crosshair, MicroGrid } from "@/components/micro-graphics";
import { useAppPreferences } from "@/components/app-preferences-provider";
import { Logo } from "@/components/logo";
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
    text: "Calcula control del balón, distancia por equipo, zonas de acción y presión defensiva.",
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
    title: "análisis colectivo",
    value: "2x",
    label: "métricas por equipo",
    text: "Distancia agregada, control del balón y comparativas estables entre equipo propio y rival.",
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
    label: "marcaje automático",
    text: "Detecta goles, remates, pases clave, duelos, pérdidas y situaciones de riesgo defensivo.",
  },
];

const techMetrics = [
  { label: "Velocidad de procesamiento", value: 94 },
  { label: "Precisión de detección", value: 99 },
  { label: "métricas por análisis", value: 78 },
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
    name: "Sofía Reyes",
    role: "Coordinadora de análisis, Academia Sur FC",
  },
];

const processStepsEn = [
  { step: "01", title: "Video upload", text: "Upload standard match footage from a drone, fixed camera, or mobile device.", icon: FileVideo },
  { step: "02", title: "AI detection", text: "The model identifies players, referees, and the ball frame by frame with sub-pixel precision.", icon: Cpu },
  { step: "03", title: "Data extraction", text: "It calculates ball control, distance by team, action zones, and defensive pressure.", icon: TrendingUp },
  { step: "04", title: "Tactical report", text: "It delivers maps, charts, and comparisons ready for coaching and scouting teams.", icon: BarChart2 },
];

const capabilitiesEn = [
  { title: "Positional tracking", value: "99.2%", label: "detection accuracy", text: "Tracks every player's exact position and builds continuous trajectories throughout the match." },
  { title: "Team analysis", value: "2x", label: "team metrics", text: "Aggregated distance, ball control, and stable comparisons between your team and the opponent." },
  { title: "Tactical intelligence", value: "4-3-3", label: "detected formation", text: "Infers defensive lines, pressing blocks, and attacking transitions without manual tagging." },
  { title: "Key events", value: "<2s", label: "automatic tagging", text: "Detects goals, shots, key passes, duels, turnovers, and defensive risk situations." },
];

const techMetricsEn = [
  { label: "Processing speed", value: 94 },
  { label: "Detection accuracy", value: 99 },
  { label: "Metrics per analysis", value: 78 },
  { label: "Event coverage", value: 87 },
];

const testimonialsEn = [
  { quote: "DRIVXIS gave us access to data that previously required a full analysis team. Now we have it in minutes.", name: "Carlos Mendoza", role: "Head coach, Club Atlético Norte" },
  { quote: "The tactical visualization is precise and clear. We integrated the system into scouting without friction.", name: "Sofía Reyes", role: "Analysis coordinator, Academia Sur FC" },
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
  const { locale } = useAppPreferences();
  const english = locale === "en";
  const localizedProcessSteps = english ? processStepsEn : processSteps;
  const localizedCapabilities = english ? capabilitiesEn : capabilities;
  const localizedTechMetrics = english ? techMetricsEn : techMetrics;
  const localizedTestimonials = english ? testimonialsEn : testimonials;
  return (
    <main className="site-shell">
      <SiteHeader
        navItems={[
          { href: "#inicio", label: english ? "Home" : "Inicio" },
          { href: "#proceso", label: english ? "Process" : "Proceso" },
          { href: "#capacidades", label: english ? "Capabilities" : "Capacidades" },
          { href: "#contacto", label: english ? "Contact" : "Contacto" },
        ]}
        action={
          <>
            <span className="live-chip live-chip--small">
              <span />
              {english ? "Online" : "En línea"}
            </span>
            <Link className="button primary" href="/login">
              {english ? "Log in" : "Iniciar sesión"}
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
          <p className="hero-kicker">{english ? "AI-powered tactical analysis" : "análisis táctico con inteligencia artificial"}</p>
          <p className="hero-lead">
            {english
              ? "Turn any match recording into actionable tactical and physical data. Built for coaching teams that work with evidence."
              : "Convierte cualquier grabación de partido en datos tácticos y físicos procesables. Diseñado para cuerpos técnicos que trabajan con evidencia."}
          </p>
          <div className="hero-actions">
            <Link className="button primary command-button" href="/register">
              {english ? "Start analysis" : "Comenzar análisis"}
              <ArrowRight size={14} />
            </Link>
            <a className="button ghost command-button" href="#proceso">
              {english ? "See process" : "Ver proceso"}
              <ChevronRight size={14} />
            </a>
          </div>
        </div>

        <div className="scroll-indicator" aria-hidden="true">
          <span />
          {english ? "Scroll" : "Desliza"}
        </div>
      </section>

      <section className="metrics-band" aria-label={english ? "Platform metrics" : "Métricas de plataforma"}>
        <MicroGrid />
        {[
          { value: "40+", label: english ? "metrics per match" : "métricas por partido" },
          { value: "99.2%", label: english ? "Detection accuracy" : "Precisión de detección" },
          { value: "<5min", label: english ? "Processing time" : "Tiempo de procesamiento" },
          { value: "24/7", label: english ? "System access" : "Acceso al sistema" },
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
          <AnnotationLine label={english ? "section" : "sección"} value={english ? "02 / PROCESS" : "02 / PROCESO"} />
          <h2>
            {english ? "How it works" : "Cómo funciona"}<span>.</span>
          </h2>
          <p>{english ? "An automated pipeline turns raw video into tactical intelligence in under five minutes." : "Un pipeline automatizado transforma video crudo en inteligencia táctica en menos de cinco minutos."}</p>
        </div>

        <div className="process-grid">
          {localizedProcessSteps.map((step) => {
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
            <AnnotationLine label={english ? "section" : "sección"} value={english ? "03 / CAPABILITIES" : "03 / CAPACIDADES"} />
            <h2>
              {english ? "What it analyzes" : "Qué analiza"}<span>.</span>
            </h2>
          </div>
        </div>

        <div className="capability-grid">
          {localizedCapabilities.map((capability, index) => (
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
          <h3>{english ? "System technical indicators" : "Indicadores técnicos del sistema"}</h3>
          <div className="tech-bars">
            {localizedTechMetrics.map((metric) => (
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
          <AnnotationLine label={english ? "visualization" : "visualización"} value="04 / RADAR" />
          <h2>
            {english ? "Real-time tactical field" : "Campo táctico en tiempo real"}<span>.</span>
          </h2>
          <p>
            {english
              ? "Every analysis generates an interactive tactical map with formations, action zones, defensive lines, and collective movements by match segment."
              : "Cada análisis genera un mapa táctico interactivo: formaciones, zonas de acción, líneas defensivas y movimientos colectivos por tramo."}
          </p>
          <div className="feature-list">
            {(english ? ["Automatic formation", "Individual heatmaps", "Lines and blocks", "Territorial control"] : ["Formación automática", "Heatmaps individuales", "Líneas y bloques", "Control territorial"]).map((item) => (
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
            {tacticalPlayers.map((player) => (
              <span
                className={`player-marker ${player.team}`}
                data-label={player.label}
                key={`${player.team}-${player.left}-${player.top}-${player.label || "none"}`}
                style={{ left: player.left, top: player.top }}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="testimonial-section">
        {localizedTestimonials.map((testimonial) => (
          <article className="testimonial-card" key={testimonial.name}>
            <p>{testimonial.quote}</p>
            <strong>{testimonial.name}</strong>
            <span>{testimonial.role}</span>
          </article>
        ))}
      </section>

      <section className="final-cta" id="contacto">
        <h2>{english ? "Start analyzing your next match" : "Empieza a analizar tu próximo partido"}</h2>
        <p>{english ? "Log in to access the analysis module. No installations or additional hardware." : "Inicia sesión para acceder al módulo de análisis. Sin instalaciones, sin hardware adicional."}</p>
        <Link className="button primary command-button" href="/login">
          {english ? "Enter system" : "Entrar al sistema"}
          <ArrowRight size={14} />
        </Link>
      </section>

      <footer className="site-footer">
        <span className="footer-brand"><Logo href="#inicio" /></span>
        <span>2026 / Football intelligence system</span>
        <div>
          <a href="#inicio">{english ? "Privacy" : "Privacidad"}</a>
          <a href="#inicio">{english ? "Terms" : "Términos"}</a>
          <a href="#inicio">{english ? "Contact" : "Contacto"}</a>
        </div>
      </footer>
    </main>
  );
}


