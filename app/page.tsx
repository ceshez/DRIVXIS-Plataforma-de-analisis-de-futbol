import Link from "next/link";
import { Logo } from "@/components/logo";
import { futureAnalytics } from "@/lib/mock-data";
import { getRequestLocale, translateDictionary } from "@/lib/i18n";

const landingCopy = {
  navProduct: "Producto",
  navUseCases: "Casos de uso",
  navStats: "Estadisticas",
  navPipeline: "IA y pipeline",
  navSecurity: "Seguridad",
  login: "Entrar",
  register: "Crear cuenta",
  eyebrow: "Analisis de futbol con vision por computadora",
  heroTitle: "DRIVXIS convierte partidos completos en lectura tactica accionable.",
  heroBody:
    "Una plataforma para subir videos, preparar colas de analisis y visualizar estadisticas de jugadores, equipos y eventos. El modelo real se conectara despues; la base de producto queda lista desde V1.",
  heroPrimary: "Empezar ahora",
  heroSecondary: "Ver dashboard demo",
  signalA: "Tracking multiobjeto",
  signalB: "Radar tactico",
  signalC: "Posesion y presion",
  useTitle: "Para equipos que necesitan explicar el partido, no solo verlo.",
  coaches: "Entrenadores",
  coachesText: "Detecta patrones de presion, distancia entre lineas y momentos de ruptura para preparar sesiones concretas.",
  analysts: "Analistas",
  analystsText: "Centraliza videos, jobs y metricas futuras en una base ordenada para iterar modelos sin rehacer producto.",
  academies: "Academias",
  academiesText: "Convierte material de categorias formativas en evidencia visual para seguimiento individual y colectivo.",
  scouts: "Scouting",
  scoutsText: "Compara velocidad, participacion, posicionamiento y carga de trabajo con contexto del partido.",
  statsTitle: "Estadisticas preparadas para la siguiente fase del modelo.",
  pipelineTitle: "Arquitectura pensada para crecer hacia YOLO, OpenCV y homografia.",
  pipelineBody:
    "DRIVXIS separa usuarios y metadata en PostgreSQL, videos en object storage y resultados del modelo en snapshots estructurados. Eso permite incorporar Python, procesamiento asincrono y almacenamiento semiestructurado sin romper la experiencia.",
  securityTitle: "Seguridad y almacenamiento desde el primer dia.",
  securityBody:
    "Las contrasenas se guardan hasheadas, las rutas privadas verifican sesion, y los videos se suben con llaves de objeto aisladas por usuario. Los datos sensibles no se envian a traduccion.",
  ctaTitle: "Prepara tu primer laboratorio tactico.",
  ctaBody:
    "Crea una cuenta, registra videos y valida el dashboard mock mientras el modelo de analisis aprende a leer tus partidos.",
};

export default async function HomePage() {
  const locale = await getRequestLocale();
  const t = await translateDictionary(landingCopy, locale);

  const useCases = [
    { title: t.coaches, text: t.coachesText },
    { title: t.analysts, text: t.analystsText },
    { title: t.academies, text: t.academiesText },
    { title: t.scouts, text: t.scoutsText },
  ];

  return (
    <main className="site-shell">
      <header className="site-header">
        <Logo />
        <nav aria-label="Navegacion principal">
          <a href="#producto">{t.navProduct}</a>
          <a href="#casos">{t.navUseCases}</a>
          <a href="#estadisticas">{t.navStats}</a>
          <a href="#pipeline">{t.navPipeline}</a>
          <a href="#seguridad">{t.navSecurity}</a>
        </nav>
        <div className="header-actions">
          <Link className="button ghost" href="/login">
            {t.login}
          </Link>
          <Link className="button primary" href="/register">
            {t.register}
          </Link>
        </div>
      </header>

      <section className="hero-section" id="producto">
        <div className="hero-copy">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1>{t.heroTitle}</h1>
          <p>{t.heroBody}</p>
          <div className="hero-actions">
            <Link className="button primary" href="/register">
              {t.heroPrimary}
            </Link>
            <Link className="button ghost" href="/dashboard">
              {t.heroSecondary}
            </Link>
          </div>
        </div>

        <div className="hero-visual" aria-label="Visualizacion de analisis de futbol">
          <div className="analysis-field">
            <span className="field-line center" />
            <span className="field-circle" />
            <span className="heat-zone zone-a" />
            <span className="heat-zone zone-b" />
            <span className="path path-one" />
            <span className="path path-two" />
            <span className="scan-row" />
            <span className="player-token home p1" />
            <span className="player-token home p2" />
            <span className="player-token home p3" />
            <span className="player-token away p4" />
            <span className="player-token away p5" />
            <span className="player-token away p6" />
            <span className="ball-token" />
          </div>
          <div className="signal-strip">
            <span>{t.signalA}</span>
            <span>{t.signalB}</span>
            <span>{t.signalC}</span>
          </div>
        </div>
      </section>

      <section className="use-cases" id="casos">
        <div className="section-heading">
          <p className="eyebrow">Casos de uso</p>
          <h2>{t.useTitle}</h2>
        </div>
        <div className="case-grid">
          {useCases.map((item) => (
            <article className="case-card" key={item.title}>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="stats-section" id="estadisticas">
        <div className="section-heading">
          <p className="eyebrow">Metricas futuras</p>
          <h2>{t.statsTitle}</h2>
        </div>
        <div className="analytics-list">
          {futureAnalytics.map((item, index) => (
            <article key={item}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="architecture-section" id="pipeline">
        <div>
          <p className="eyebrow">Pipeline</p>
          <h2>{t.pipelineTitle}</h2>
          <p>{t.pipelineBody}</p>
        </div>
        <div className="pipeline-rail" aria-label="Flujo tecnico de DRIVXIS">
          <span>Video</span>
          <span>S3 / R2 / MinIO</span>
          <span>PostgreSQL + Prisma</span>
          <span>Python CV job</span>
          <span>Metric snapshots</span>
        </div>
      </section>

      <section className="security-section" id="seguridad">
        <div>
          <p className="eyebrow">Seguridad</p>
          <h2>{t.securityTitle}</h2>
          <p>{t.securityBody}</p>
        </div>
        <Link className="button primary" href="/register">
          {t.register}
        </Link>
      </section>

      <section className="final-cta" id="acceso">
        <h2>{t.ctaTitle}</h2>
        <p>{t.ctaBody}</p>
        <Link className="button primary" href="/register">
          {t.heroPrimary}
        </Link>
      </section>
    </main>
  );
}
