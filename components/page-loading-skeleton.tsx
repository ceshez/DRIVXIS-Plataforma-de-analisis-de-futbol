type SkeletonLineProps = {
  className?: string;
};

function SkeletonLine({ className = "" }: SkeletonLineProps) {
  return <span className={`skeleton-line ${className}`} />;
}

function DashboardSkeletonHeader() {
  return (
    <header className="loading-page__header" aria-hidden="true">
      <SkeletonLine className="loading-page__brand" />
      <nav className="loading-page__navigation">
        <SkeletonLine />
        <SkeletonLine />
      </nav>
      <SkeletonLine className="loading-page__profile" />
    </header>
  );
}

function MetricRows({ count = 4 }: { count?: number }) {
  return (
    <div className="loading-metric-rows">
      {Array.from({ length: count }, (_, index) => (
        <div className="loading-metric-row" key={index}>
          <SkeletonLine className="skeleton-line--copy" />
          <SkeletonLine className="skeleton-line--bar" />
          <SkeletonLine className="skeleton-line--tiny" />
        </div>
      ))}
    </div>
  );
}

export function DashboardPageSkeleton() {
  return (
    <main className="app-frame app-frame--dashboard-main loading-page loading-page--delayed" aria-busy="true" aria-label="Cargando panel">
      <DashboardSkeletonHeader />
      <div className="dashboard-lab dashboard-lab--figma loading-dashboard" aria-hidden="true">
        <section className="dashboard-command dashboard-command--hero loading-dashboard__command">
          <div>
            <SkeletonLine className="skeleton-line--label" />
            <SkeletonLine className="skeleton-line--dashboard-title" />
          </div>
          <SkeletonLine className="skeleton-line--status" />
        </section>

        <section className="analysis-console loading-dashboard__console">
          <div className="analysis-console__stage skeleton-surface loading-dashboard__stage">
            <SkeletonLine className="skeleton-line--upload-icon" />
            <SkeletonLine className="skeleton-line--upload-title" />
            <SkeletonLine className="skeleton-line--copy" />
            <SkeletonLine className="skeleton-line--upload-target" />
            <div className="loading-dashboard__steps">
              <SkeletonLine />
              <SkeletonLine />
              <SkeletonLine />
              <SkeletonLine />
            </div>
          </div>
          <aside className="match-panel skeleton-surface loading-dashboard__match">
            <SkeletonLine className="skeleton-line--score" />
            <SkeletonLine className="skeleton-line--section-title" />
            <MetricRows />
            <SkeletonLine className="skeleton-line--radar" />
          </aside>
        </section>

        <section className="stat-strip loading-dashboard__stats">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="stat-cell skeleton-surface loading-dashboard__stat" key={index}>
              <SkeletonLine className="skeleton-line--label" />
              <SkeletonLine className="skeleton-line--value" />
              <SkeletonLine className="skeleton-line--bar" />
            </div>
          ))}
        </section>

        <section className="chart-grid loading-dashboard__charts">
          <div className="chart-panel chart-panel--wide skeleton-surface loading-dashboard__chart">
            <SkeletonLine className="skeleton-line--section-title" />
            <SkeletonLine className="skeleton-line--chart" />
          </div>
          <div className="chart-panel skeleton-surface loading-dashboard__chart">
            <SkeletonLine className="skeleton-line--section-title" />
            <SkeletonLine className="skeleton-line--chart" />
          </div>
        </section>
      </div>
      <span className="visually-hidden">Cargando panel de análisis.</span>
    </main>
  );
}

export function HistoryPageSkeleton() {
  return (
    <main className="app-frame app-frame--videos-watch loading-page loading-page--delayed" aria-busy="true" aria-label="Cargando historial de videos">
      <DashboardSkeletonHeader />
      <section className="history-workspace loading-history" aria-hidden="true">
        <article className="history-main">
          <div className="history-detail lab-panel skeleton-surface loading-history__main">
            <SkeletonLine className="skeleton-line--label" />
            <SkeletonLine className="skeleton-line--section-title" />
            <SkeletonLine className="skeleton-line--history-video" />
            <div className="history-stat-grid loading-history__stats">
              {Array.from({ length: 4 }, (_, index) => (
                <SkeletonLine className="skeleton-line--metric" key={index} />
              ))}
            </div>
          </div>
        </article>
        <aside className="history-list lab-panel skeleton-surface loading-history__list">
          <SkeletonLine className="skeleton-line--label" />
          <SkeletonLine className="skeleton-line--section-title" />
          {Array.from({ length: 7 }, (_, index) => (
            <div className="loading-history__row" key={index}>
              <SkeletonLine className="loading-history__icon" />
              <div>
                <SkeletonLine className="skeleton-line--copy" />
                <SkeletonLine className="skeleton-line--short" />
              </div>
              <SkeletonLine className="skeleton-line--chip" />
            </div>
          ))}
        </aside>
      </section>
      <span className="visually-hidden">Cargando historial de videos.</span>
    </main>
  );
}

export function ProfilePageSkeleton() {
  return (
    <main className="app-frame dashboard-frame loading-page loading-page--delayed" aria-busy="true" aria-label="Cargando perfil">
      <DashboardSkeletonHeader />
      <section className="profile-page loading-profile" aria-hidden="true">
        <header className="profile-page__header">
          <SkeletonLine className="skeleton-line--section-title" />
          <SkeletonLine className="skeleton-line--copy" />
        </header>
        <div className="profile-editor lab-panel skeleton-surface loading-profile__editor">
          <SkeletonLine className="loading-profile__avatar" />
          <SkeletonLine className="loading-profile__file-button" />
          <div className="loading-profile__fields">
            <SkeletonLine />
            <SkeletonLine />
          </div>
          <SkeletonLine className="loading-profile__save" />
        </div>
      </section>
      <span className="visually-hidden">Cargando perfil.</span>
    </main>
  );
}

export function UsagePageSkeleton() {
  return (
    <main className="app-frame dashboard-frame loading-page loading-page--delayed" aria-busy="true" aria-label="Cargando uso de la cuenta">
      <DashboardSkeletonHeader />
      <section className="usage-page loading-usage" aria-hidden="true">
        <header className="usage-page__header">
          <SkeletonLine className="skeleton-line--section-title" />
          <SkeletonLine className="skeleton-line--copy" />
        </header>
        <section className="usage-storage skeleton-surface loading-usage__storage">
          <SkeletonLine className="skeleton-line--label" />
          <SkeletonLine className="skeleton-line--storage-value" />
          <SkeletonLine className="skeleton-line--bar loading-usage__bar" />
          <div className="loading-usage__storage-meta">
            <SkeletonLine />
            <SkeletonLine />
            <SkeletonLine />
          </div>
        </section>
        <section className="usage-videos">
          <SkeletonLine className="skeleton-line--section-title" />
          <div className="usage-videos__grid loading-usage__metrics">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="usage-metric skeleton-surface" key={index}>
                <SkeletonLine className="skeleton-line--label" />
                <SkeletonLine className="skeleton-line--value" />
              </div>
            ))}
          </div>
        </section>
        <section className="usage-bot skeleton-surface loading-usage__bot">
          <SkeletonLine className="skeleton-line--section-title" />
          <SkeletonLine className="skeleton-line--copy" />
        </section>
      </section>
      <span className="visually-hidden">Cargando uso de la cuenta.</span>
    </main>
  );
}

export function ChatbotPageSkeleton() {
  return (
    <main className="chatbot-route loading-page loading-page--delayed" aria-busy="true" aria-label="Cargando asistente táctico">
      <div className="loading-chatbot" aria-hidden="true">
        <aside className="loading-chatbot__sidebar">
          <SkeletonLine className="loading-page__brand" />
          <SkeletonLine className="loading-chatbot__new-chat" />
          <SkeletonLine className="skeleton-line--label" />
          {Array.from({ length: 5 }, (_, index) => (
            <SkeletonLine className="loading-chatbot__item" key={index} />
          ))}
          <SkeletonLine className="loading-chatbot__account" />
        </aside>
        <section className="loading-chatbot__main">
          <header className="loading-chatbot__topbar">
            <SkeletonLine className="skeleton-line--section-title" />
            <SkeletonLine className="skeleton-line--chip" />
          </header>
          <div className="loading-chatbot__welcome">
            <SkeletonLine className="loading-chatbot__welcome-title" />
            <SkeletonLine className="skeleton-line--copy" />
            <SkeletonLine className="loading-chatbot__composer" />
            <div className="loading-chatbot__suggestions">
              {Array.from({ length: 4 }, (_, index) => (
                <SkeletonLine key={index} />
              ))}
            </div>
          </div>
        </section>
      </div>
      <span className="visually-hidden">Cargando asistente táctico.</span>
    </main>
  );
}

export function AuthPageSkeleton({ mode }: { mode: "login" | "register" }) {
  const fieldCount = mode === "register" ? 3 : 2;
  return (
    <main className="auth-page loading-auth loading-page--delayed" aria-busy="true" aria-label={mode === "register" ? "Cargando registro" : "Cargando acceso"}>
      <section className="auth-panel loading-auth__panel" aria-hidden="true">
        <SkeletonLine className="loading-auth__brand" />
        <SkeletonLine className="skeleton-line--label" />
        <SkeletonLine className="skeleton-line--auth-title" />
        <SkeletonLine className="skeleton-line--copy" />
        <div className="loading-auth__fields">
          {Array.from({ length: fieldCount }, (_, index) => (
            <SkeletonLine key={index} />
          ))}
          <SkeletonLine className="loading-auth__button" />
        </div>
        <SkeletonLine className="loading-auth__switch" />
      </section>
      <span className="visually-hidden">Cargando formulario.</span>
    </main>
  );
}

export function SitePageSkeleton() {
  return (
    <main className="site-shell loading-site loading-page--delayed" aria-busy="true" aria-label="Cargando página">
      <header className="loading-site__bar" aria-hidden="true">
        <SkeletonLine className="loading-page__brand" />
        <div className="loading-site__nav">
          <SkeletonLine />
          <SkeletonLine />
          <SkeletonLine />
        </div>
        <SkeletonLine className="loading-site__action" />
      </header>
      <section className="hero-section loading-site__hero" aria-hidden="true">
        <SkeletonLine className="skeleton-line--system-badge" />
        <SkeletonLine className="loading-site__wordmark" />
        <SkeletonLine className="skeleton-line--copy" />
        <SkeletonLine className="loading-site__lead" />
        <div className="loading-site__actions">
          <SkeletonLine />
          <SkeletonLine />
        </div>
      </section>
      <section className="metrics-band loading-site__metrics" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="metric-tile" key={index}>
            <SkeletonLine className="skeleton-line--value" />
            <SkeletonLine className="skeleton-line--label" />
          </div>
        ))}
      </section>
      <section className="section-block loading-site__process" aria-hidden="true">
        <SkeletonLine className="skeleton-line--section-title" />
        <div className="process-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="process-card" key={index}>
              <SkeletonLine className="skeleton-line--icon" />
              <SkeletonLine className="skeleton-line--copy" />
              <SkeletonLine />
              <SkeletonLine className="skeleton-line--short" />
            </div>
          ))}
        </div>
      </section>
      <span className="visually-hidden">Cargando página.</span>
    </main>
  );
}
