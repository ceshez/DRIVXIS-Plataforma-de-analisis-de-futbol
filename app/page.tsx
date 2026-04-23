import Link from "next/link";
import { futureAnalytics } from "@/lib/mock-data";
import { getRequestLocale, translateDictionary } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";

const landingCopy = {
  navProduct: "Inicio",
  navUseCases: "Proceso",
  navStats: "Capacidades",
  navPipeline: "Contacto",
  login: "Iniciar sesión",
  register: "En línea",
  eyebrow: "Football intelligence system - v2.1",
  heroTitle: "DRIVXIS",
  heroBody:
    "Convierte cualquier grabación de partido en datos tacticos y fisicos procesables. Diseñado para cuerpos tecnicos que trabajan con evidencia.",
  heroPrimary: "Comenzar analisis",
  heroSecondary: "Ver proceso",
  metricsTitle: "Métricas por partido",
  metricA: "40+",
  metricALabel: "Métricas por partido",
  metricB: "99.2%",
  metricBLabel: "Precisión de detección",
  metricC: "<5min",
  metricCLabel: "Tiempo de procesamiento",
  metricD: "24/7",
  metricDLabel: "Acceso al sistema",
  processTitle: "Cómo funciona.",
  processBody:
    "Un pipeline completamente automatizado que transforma video crudo en inteligencia tactica en menos de cinco minutos.",
  featureTitle: "Qué analiza.",
  featureBody:
    "Cada modulo fue diseñado con input directo de cuerpos tecnicos profesionales.",
  visualTitle: "Campo tactico en tiempo real",
  visualBody:
    "Cada analisis genera un mapa tactico interactivo del partido. Visualiza formaciones, zonas de accion, lineas defensivas y movimientos colectivos fotograma a fotograma.",
  ctaTitle: "Empieza a analizar tu próximo partido",
  ctaBody:
    "Inicia sesion para acceder al modulo de analisis. Sin instalaciones, sin hardware adicional.",
  footerLeft: "DRIVXIS",
};

export default async function HomePage() {
  const locale = await getRequestLocale();
  const t = await translateDictionary(landingCopy, locale);

  const processSteps = [
    {
      index: "01",
      title: "Carga del video",
      text: "Sube el footage del partido en cualquier formato estándar. El sistema acepta grabaciones desde drones, cámaras fijas o dispositivos móviles.",
    },
    {
      index: "02",
      title: "Detección con IA",
      text: "Nuestro modelo de visión computacional detecta jugadores, árbitros y el balón fotograma a fotograma con precisión sub-pixel.",
    },
    {
      index: "03",
      title: "Extracción de datos",
      text: "Se calculan trayectorias, velocidades, zonas de acción, presión defensiva, posesión y más de 40 métricas por jugador.",
    },
    {
      index: "04",
      title: "Reporte táctico",
      text: "Los resultados se presentan en un dashboard interactivo con mapas de calor, gráficos tácticos y comparativas de rendimiento.",
    },
  ];

  const capabilityCards = [
    {
      title: "Tracking posicional",
      stat: "99.2%",
      label: "precisión de detección",
      text:
        "Identifica la posición exacta de cada jugador en cada fotograma del video, construyendo trayectorias continuas a lo largo del partido.",
    },
    {
      title: "Análisis físico",
      stat: "40+",
      label: "métricas por jugador",
      text:
        "Distancia recorrida, velocidades máximas y promedio, sprints, esfuerzos de alta intensidad y zonas de frecuencia cardiaca estimada.",
    },
    {
      title: "Inteligencia táctica",
      stat: "4-3-3",
      label: "formación detectada auto.",
      text:
        "El sistema infiere la formación táctica, líneas defensivas, bloque de presión y transiciones ofensivas sin intervención manual.",
    },
    {
      title: "Eventos clave",
      stat: "<2s",
      label: "tiempo de marcaje",
      text:
        "Detecta automáticamente goles, disparos, pases clave, duelos, pérdidas de balón y situaciones de riesgo defensivo.",
    },
  ];

  const testimonials = [
    {
      quote:
        "DRIVXIS nos dio acceso a datos que antes requerían un equipo de analistas. Ahora los tenemos en minutos.",
      name: "Carlos Mendoza",
      role: "Director Técnico — Club Atlético Norte",
    },
    {
      quote:
        "La visualización táctica es precisa y clara. Integramos el sistema en nuestros procesos de scouting sin fricciones.",
      name: "Sofía Reyes",
      role: "Coordinadora de Análisis — Academia Sur FC",
    },
  ];

  return (
    <main className="site-shell overflow-x-hidden">
      <SiteHeader
        navItems={[
          { href: "#inicio", label: t.navProduct },
          { href: "#proceso", label: t.navUseCases },
          { href: "#capacidades", label: t.navStats },
          { href: "#contacto", label: t.navPipeline },
        ]}
        action={
          <>
            <span className="status-chip">En línea</span>
            <Link className="button primary" href="/login">
              {t.login}
            </Link>
          </>
        }
      />

      <section className="hero-section" id="inicio">
        <div className="hero-copy hero-copy--home">
          <p className="eyebrow hero-eyebrow">{t.eyebrow}</p>
          <h1>
            DRI<span>V</span>XIS
          </h1>
          <p className="hero-lead">{t.heroBody}</p>
          <div className="hero-actions">
            <Link className="button primary" href="/register">
              {t.heroPrimary}
            </Link>
            <Link className="button ghost" href="/dashboard">
              {t.heroSecondary}
            </Link>
          </div>
          <p className="hero-scroll">SCROLL</p>
        </div>
      </section>

      <section className="stats-section stats-band">
        <div className="stats-title">{t.metricsTitle}</div>
        <div className="metric-grid metric-grid--band">
          {[
            { value: t.metricA, label: t.metricALabel },
            { value: t.metricB, label: t.metricBLabel },
            { value: t.metricC, label: t.metricCLabel },
            { value: t.metricD, label: t.metricDLabel },
          ].map((metric) => (
            <article className="metric-card metric-card--band" key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="use-cases section-tight" id="proceso">
        <div className="section-heading">
          <p className="eyebrow">Sección</p>
          <h2>{t.processTitle}</h2>
          <p>{t.processBody}</p>
        </div>
        <div className="case-grid case-grid--process">
          {processSteps.map((step) => (
            <article className="case-card process-card" key={step.index}>
              <span className="process-index">{step.index}</span>
              <strong>{step.title}</strong>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="stats-section section-tight" id="capacidades">
        <div className="section-heading section-heading--split">
          <div>
            <p className="eyebrow">Capacidades</p>
            <h2>{t.featureTitle}</h2>
          </div>
          <p className="section-note">{t.featureBody}</p>
        </div>

        <div className="capabilities-grid">
          {capabilityCards.map((card, index) => (
            <article className={`capability-card ${index === 0 ? "is-featured" : ""}`} key={card.title}>
              <div className="capability-head">
                <span>{card.title}</span>
                <strong>{String(index + 1).padStart(2, "0")}</strong>
              </div>
              <div className="capability-stats">
                <strong>{card.stat}</strong>
                <span>{card.label}</span>
              </div>
              <p>{card.text}</p>
            </article>
          ))}
        </div>

        <div className="system-strip">
          <div>
            <span>Velocidad de procesamiento</span>
            <strong>94%</strong>
          </div>
          <div>
            <span>Precisión de detección</span>
            <strong>99%</strong>
          </div>
          <div>
            <span>Métricas por análisis</span>
            <strong>18/100</strong>
          </div>
          <div>
            <span>Cobertura de eventos</span>
            <strong>87%</strong>
          </div>
        </div>
      </section>

      <section className="architecture-section section-tight" aria-label="Visualizacion tactica">
        <div className="architecture-copy">
          <p className="eyebrow">Visualización</p>
          <h2>{t.visualTitle}</h2>
          <p>{t.visualBody}</p>
          <ul className="feature-list">
            <li>Detección de formación automática</li>
            <li>Heatmaps individuales y colectivos</li>
            <li>Análisis de líneas y bloques</li>
          </ul>
        </div>
        <div className="pitch-shell pitch-shell--home">
          <div className="pitch" aria-label="Mapa tactico">
            <span className="midline" />
            <span className="center-circle" />
            <span className="box left" />
            <span className="box right" />
            <span className="ball" style={{ left: "63%", top: "45%" }} />
            <span className="player-dot home" style={{ left: "18%", top: "28%" }} />
            <span className="player-dot home" style={{ left: "28%", top: "52%" }} />
            <span className="player-dot home" style={{ left: "44%", top: "38%" }} />
            <span className="player-dot away" style={{ left: "68%", top: "26%" }} />
            <span className="player-dot away" style={{ left: "78%", top: "44%" }} />
            <span className="player-dot away" style={{ left: "70%", top: "68%" }} />
          </div>
        </div>
      </section>

      <section className="testimonials-section section-tight">
        <div className="testimonials-grid">
          {testimonials.map((item) => (
            <article className="testimonial-card" key={item.name}>
              <span className="quote-mark" aria-hidden="true">
                ""
              </span>
              <p>{item.quote}</p>
              <strong>{item.name}</strong>
              <span>{item.role}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="final-cta" id="contacto">
        <p className="eyebrow">Acceso al sistema</p>
        <h2>{t.ctaTitle}</h2>
        <p>{t.ctaBody}</p>
        <Link className="button primary" href="/login">
          {t.login}
        </Link>
      </section>

      <footer className="site-footer">
        <span>{t.footerLeft}</span>
        <span>© 2026 DRIVXIS — Football intelligence system</span>
        <div className="footer-links">
          <a href="#inicio">Privacidad</a>
          <a href="#inicio">Términos</a>
          <a href="#inicio">Contacto</a>
        </div>
      </footer>
    </main>
  );
}
