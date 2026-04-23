"use client";

import { useMemo, useState } from "react";
import { demoStats } from "@/lib/mock-data";

const phases = [
  { id: "press", label: "Presion", homeShift: 4, awayShift: -2, ball: [63, 45] },
  { id: "build", label: "Salida", homeShift: -5, awayShift: 3, ball: [38, 56] },
  { id: "transition", label: "Transicion", homeShift: 9, awayShift: -6, ball: [72, 31] },
];

export function RadarDemo() {
  const [phase, setPhase] = useState(phases[0]);
  const players = useMemo(
    () =>
      demoStats.players.map((player, index) => ({
        ...player,
        x: Math.max(8, Math.min(92, player.x + (player.team === "home" ? phase.homeShift : phase.awayShift))),
        y: Math.max(10, Math.min(90, player.y + (index % 2 === 0 ? 3 : -3))),
      })),
    [phase],
  );

  return (
    <section className="radar-module" aria-label="Demo tactica interactiva">
      <div className="module-heading">
        <p className="eyebrow">Demo interactiva</p>
        <h2>Radar tactico preparado para el modelo</h2>
        <p>
          Esta vista simula como DRIVXIS mostrara posiciones, fases y eventos cuando el pipeline
          de vision por computadora este conectado.
        </p>
      </div>

      <div className="phase-controls" role="tablist" aria-label="Fases de juego">
        {phases.map((item) => (
          <button
            key={item.id}
            className={item.id === phase.id ? "active" : ""}
            type="button"
            onClick={() => setPhase(item)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="pitch-shell">
        <div className="pitch" role="img" aria-label={`Mapa radar en fase ${phase.label}`}>
          <span className="midline" />
          <span className="center-circle" />
          <span className="box left" />
          <span className="box right" />
          <span className="ball" style={{ left: `${phase.ball[0]}%`, top: `${phase.ball[1]}%` }} />
          {players.map((player, index) => (
            <span
              key={`${player.team}-${index}`}
              className={`player-dot ${player.team}`}
              style={{ left: `${player.x}%`, top: `${player.y}%` }}
            />
          ))}
          <svg className="run-lines" viewBox="0 0 100 100" aria-hidden="true">
            <path d="M18 28 C34 22, 48 34, 63 45" />
            <path d="M31 48 C44 54, 58 51, 72 31" />
            <path d="M74 42 C68 55, 62 61, 54 72" />
          </svg>
        </div>
      </div>
    </section>
  );
}
