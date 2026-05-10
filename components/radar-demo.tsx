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
    <section className="radar-module" aria-label="Demo táctica interactiva">
      <div className="module-heading">
        <p className="eyebrow">Demo interactiva</p>
        <h2>Radar táctico preparado para el modelo</h2>
        <p>
          Esta vista simula cómo DRIVXIS mostrará posiciones, fases y eventos cuando el pipeline
          de visión por computadora esté conectado.
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
          <svg aria-hidden="true" className="run-lines" viewBox="0 0 100 100"><path d="M18 28c16-6 30 6 45 17"/><path d="M31 48c13 6 27 3 41-17m2 11c-6 13-12 19-20 30"/></svg>
        </div>
      </div>
    </section>
  );
}
