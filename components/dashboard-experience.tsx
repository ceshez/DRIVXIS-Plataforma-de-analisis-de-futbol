"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, CheckCircle2, Film, Play, ScanLine, Shield, Upload } from "lucide-react";
import { AnnotationLine, CornerMarks, Crosshair, MicroGrid } from "@/components/micro-graphics";

type RecentVideo = {
  id: string;
  originalFilename: string;
  status: string;
  createdAt: string;
};

type DashboardExperienceProps = {
  userName: string;
  videos: RecentVideo[];
};

const radarData = [
  { subject: "VEL", local: 88, rival: 72 },
  { subject: "TEC", local: 82, rival: 79 },
  { subject: "FIS", local: 75, rival: 83 },
  { subject: "TAC", local: 90, rival: 65 },
  { subject: "AIR", local: 60, rival: 85 },
  { subject: "PRE", local: 78, rival: 70 },
];

const intensityData = [
  { minute: "0'", value: 65 },
  { minute: "15'", value: 78 },
  { minute: "30'", value: 82 },
  { minute: "45'", value: 60 },
  { minute: "60'", value: 88 },
  { minute: "75'", value: 76 },
  { minute: "90'", value: 65 },
];

const zoneData = [
  { zone: "DEF", value: 28 },
  { zone: "MED-D", value: 42 },
  { zone: "MED-A", value: 65 },
  { zone: "ATQ", value: 84 },
];

const bottomStats = [
  { label: "Posesion", value: "58.6", unit: "%", bar: 59 },
  { label: "Pases completados", value: "342", unit: "pases", bar: 78 },
  { label: "Distancia equipo", value: "112.4", unit: "km", bar: 85 },
  { label: "Sprints totales", value: "86", unit: "runs", bar: 62 },
  { label: "Remates", value: "16", unit: "tiros", bar: 55 },
  { label: "Presion alta", value: "74", unit: "%", bar: 74 },
];

const playerStats = [
  { label: "Goles", value: "2", player: "L. Vega", bar: 64 },
  { label: "Asistencias", value: "3", player: "A. Mendez", bar: 78 },
  { label: "Km recorridos", value: "12.1", player: "M. Torres", bar: 88 },
  { label: "Vel. max.", value: "31.4", unit: "km/h", player: "C. Ramirez", bar: 71 },
];

const analysisSteps = ["Carga validada", "Tracking multiobjeto", "Homografia del campo", "Eventos y presion", "Reporte tactico"];

export function DashboardExperience({ userName, videos }: DashboardExperienceProps) {
  return (
    <div className="dashboard-lab">
      <section className="dashboard-command">
        <MicroGrid />
        <div className="dashboard-command__copy">
          <AnnotationLine label="modulo" value="DRIVXIS / ANALISIS" />
          <h1>Dashboard de analisis</h1>
          <p>
            Hola, {userName}. Tu laboratorio tactico esta listo con metricas, fases, mapas y actividad
            reciente.
          </p>
        </div>
        <div className="live-chip">
          <span />
          En espera
        </div>
      </section>

      <section className="analysis-console" aria-label="Consola de analisis">
        <div className="analysis-console__stage">
          <CornerMarks size={14} opacity={0.45} />
          <div className="console-toolbar">
            <div>
              <span>Partido demo</span>
              <strong>FC Norte vs UD Sur</strong>
            </div>
            <button className="icon-button" type="button" aria-label="Reproducir demo">
              <Play size={15} />
            </button>
          </div>

          <div className="video-radar">
            <MicroGrid />
            <div className="video-radar__field">
              <span className="field-midline" />
              <span className="field-circle" />
              <span className="field-box field-box--left" />
              <span className="field-box field-box--right" />
              <span className="heat heat--one" />
              <span className="heat heat--two" />
              <span className="scan-row" />
              <span className="ball-marker" style={{ left: "63%", top: "45%" }} />
              {[
                ["home", "18%", "28%"],
                ["home", "31%", "48%"],
                ["home", "46%", "34%"],
                ["home", "62%", "58%"],
                ["home", "74%", "42%"],
                ["away", "22%", "68%"],
                ["away", "38%", "22%"],
                ["away", "54%", "72%"],
                ["away", "69%", "25%"],
                ["away", "83%", "62%"],
              ].map(([team, left, top], index) => (
                <span className={`player-marker ${team}`} key={`${team}-${index}`} style={{ left, top }} />
              ))}
            </div>
          </div>

          <div className="analysis-steps">
            {analysisSteps.map((step, index) => (
              <div className="analysis-step" key={step}>
                <span className={index < 3 ? "is-complete" : index === 3 ? "is-active" : ""}>
                  {index < 3 ? <CheckCircle2 size={9} /> : null}
                </span>
                {step}
              </div>
            ))}
          </div>
        </div>

        <aside className="match-panel">
          <CornerMarks size={12} opacity={0.35} />
          <div className="score-card">
            <div>
              <span>Local</span>
              <strong>FC Norte</strong>
            </div>
            <div className="score-card__score">
              <b>2</b>
              <span>-</span>
              <b>0</b>
            </div>
            <div>
              <span>Visitante</span>
              <strong>UD Sur</strong>
            </div>
          </div>

          <div className="player-stat-list">
            <h2>Estadisticas clave</h2>
            {playerStats.map((stat) => (
              <article className="player-stat" key={stat.label}>
                <div>
                  <span>{stat.label}</span>
                  <small>{stat.player}</small>
                </div>
                <strong>
                  {stat.value}
                  {stat.unit ? <small>{stat.unit}</small> : null}
                </strong>
                <span className="meter">
                  <span style={{ width: `${stat.bar}%` }} />
                </span>
              </article>
            ))}
          </div>

          <div className="radar-card">
            <h2>Rendimiento global</h2>
            <ResponsiveContainer width="100%" height={170}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(255,107,43,0.13)" strokeDasharray="3 3" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: "rgba(255,255,255,0.34)", fontSize: 8 }} />
                <PolarRadiusAxis tick={false} axisLine={false} />
                <Radar dataKey="local" stroke="#ff6b2b" strokeWidth={1.6} fill="#ff6b2b" fillOpacity={0.12} />
                <Radar dataKey="rival" stroke="rgba(255,255,255,0.26)" strokeWidth={1} fill="none" />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </aside>
      </section>

      <section className="stat-strip" aria-label="Metricas del partido demo">
        {bottomStats.map((stat, index) => (
          <article className="stat-cell" key={stat.label}>
            <span>{stat.label}</span>
            <strong>
              {stat.value}
              <small>{stat.unit}</small>
            </strong>
            <span className="meter">
              <span style={{ width: `${stat.bar}%` }} />
            </span>
            <b>{String(index + 1).padStart(2, "0")}</b>
          </article>
        ))}
      </section>

      <section className="chart-grid">
        <article className="chart-panel chart-panel--wide">
          <Crosshair className="chart-crosshair" size={15} opacity={0.16} />
          <h2>Intensidad de pressing</h2>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={intensityData} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid stroke="rgba(255,107,43,0.08)" strokeDasharray="3 3" />
              <XAxis dataKey="minute" tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ stroke: "rgba(255,107,43,0.2)" }} contentStyle={{ background: "#0b0b0b", border: "1px solid rgba(255,107,43,0.25)", color: "#f2f0ee" }} />
              <Line type="monotone" dataKey="value" stroke="#ff6b2b" strokeWidth={1.6} dot={{ r: 2.5, fill: "#ff6b2b", strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </article>

        <article className="chart-panel">
          <h2>Presion por zona</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={zoneData} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid stroke="rgba(255,107,43,0.08)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="zone" tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "rgba(255,107,43,0.04)" }} contentStyle={{ background: "#0b0b0b", border: "1px solid rgba(255,107,43,0.25)", color: "#f2f0ee" }} />
              <Bar dataKey="value">
                {zoneData.map((_, index) => (
                  <Cell key={index} fill={`rgba(255,107,43,${0.25 + index * 0.16})`} stroke="#ff6b2b" strokeWidth={0.5} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="chart-panel chart-panel--field">
          <h2>Mapa de calor</h2>
          <svg viewBox="0 0 240 130" fill="none" aria-hidden="true">
            <rect x="2" y="2" width="236" height="126" stroke="rgba(255,107,43,0.24)" strokeWidth="0.75" />
            <line x1="120" y1="2" x2="120" y2="128" stroke="rgba(255,107,43,0.14)" strokeWidth="0.5" />
            <circle cx="120" cy="65" r="20" stroke="rgba(255,107,43,0.14)" strokeWidth="0.5" />
            <ellipse cx="55" cy="65" rx="22" ry="32" fill="rgba(255,107,43,0.07)" />
            <ellipse cx="85" cy="38" rx="18" ry="16" fill="rgba(255,107,43,0.1)" />
            <ellipse cx="85" cy="92" rx="18" ry="16" fill="rgba(255,107,43,0.1)" />
            <ellipse cx="135" cy="65" rx="28" ry="24" fill="rgba(255,107,43,0.17)" />
            <ellipse cx="168" cy="48" rx="20" ry="16" fill="rgba(255,107,43,0.14)" />
            <ellipse cx="168" cy="82" rx="20" ry="16" fill="rgba(255,107,43,0.14)" />
            <ellipse cx="155" cy="65" rx="14" ry="14" fill="rgba(255,107,43,0.24)" />
            <circle cx="155" cy="65" r="3.5" stroke="#ff6b2b" strokeWidth="0.75" />
          </svg>
        </article>
      </section>

      <section className="recent-videos lab-panel">
        <div className="panel-heading">
          <div>
            <span>Biblioteca</span>
            <h2>Material reciente</h2>
          </div>
          <a href="/dashboard/videos" className="text-command">
            <Upload size={13} />
            Subir video
          </a>
        </div>

        {videos.length === 0 ? (
          <div className="empty-state">
            <ScanLine size={24} />
            <strong>No hay videos registrados todavia.</strong>
            <span>Sube tu primer partido para activar la cola de analisis.</span>
          </div>
        ) : (
          <div className="video-list">
            {videos.map((video) => (
              <article className="video-row" key={video.id}>
                <Film size={17} />
                <div>
                  <strong>{video.originalFilename}</strong>
                  <span>{formatDate(video.createdAt)}</span>
                </div>
                <span className={`status-pill ${video.status.toLowerCase()}`}>{formatStatus(video.status)}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="security-line">
        <Activity size={15} />
        <span>Pipeline preparado para modelos de vision, tracking multiobjeto y reportes tacticos.</span>
        <Shield size={15} />
      </section>
    </div>
  );
}

function formatStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return date.toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
}
