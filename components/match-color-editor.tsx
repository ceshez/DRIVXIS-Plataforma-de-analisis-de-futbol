"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { AnalysisMetrics } from "@/lib/analysis-metrics";

type MatchColorEditorProps<TVideo> = {
  video: TVideo;
  onSaved: (video: TVideo) => void;
};

type VideoWithMatch = {
  id: string;
  metadata?: unknown;
  latestMetrics?: AnalysisMetrics | null;
};

type MatchInfo = {
  ownTeam?: string;
  rivalTeam?: string;
  ownTeamColor?: string;
  rivalTeamColor?: string;
};

export function MatchColorEditor<TVideo extends VideoWithMatch>({ video, onSaved }: MatchColorEditorProps<TVideo>) {
  const matchInfo = getVideoMatchInfo(video);
  const suggestedColors = video.latestMetrics?.match?.detectedTeamColors;
  const suggestedOwnColor = matchInfo.ownTeamColor ?? suggestedColors?.team1 ?? "#ff6b2b";
  const suggestedRivalColor = matchInfo.rivalTeamColor ?? suggestedColors?.team2 ?? "#f2f0ee";
  const [ownTeamColor, setOwnTeamColor] = useState(suggestedOwnColor);
  const [rivalTeamColor, setRivalTeamColor] = useState(suggestedRivalColor);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    setOwnTeamColor(suggestedOwnColor);
    setRivalTeamColor(suggestedRivalColor);
    setState("idle");
  }, [video.id, suggestedOwnColor, suggestedRivalColor]);

  async function saveColors() {
    setState("saving");
    const response = await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matchInfo: { ownTeamColor, rivalTeamColor } }),
    });
    const data = (await response.json().catch(() => ({}))) as { video?: TVideo };
    if (!response.ok || !data.video) {
      setState("error");
      return;
    }
    onSaved(data.video);
    setState("saved");
  }

  return (
    <div className="match-color-editor" aria-label="Colores de equipos">
      <div>
        <span>Colores del partido</span>
        <strong>{matchInfo.ownTeam ?? "Equipo 1"} / {matchInfo.rivalTeam ?? "Equipo 2"}</strong>
        {suggestedColors?.team1 || suggestedColors?.team2 ? <small>Sugeridos por el analisis</small> : null}
      </div>
      <label>
        <span>Propio</span>
        <input type="color" value={ownTeamColor} onChange={(event) => setOwnTeamColor(event.target.value)} />
      </label>
      <label>
        <span>Rival</span>
        <input type="color" value={rivalTeamColor} onChange={(event) => setRivalTeamColor(event.target.value)} />
      </label>
      <button className="button ghost command-button" type="button" onClick={() => void saveColors()} disabled={state === "saving"}>
        {state === "saving" ? <Loader2 className="spin" size={14} /> : <Save size={14} />}
        {state === "saved" ? "Guardado" : state === "error" ? "Reintentar" : "Guardar"}
      </button>
    </div>
  );
}

function getVideoMatchInfo(video: VideoWithMatch): MatchInfo {
  const metadata = video.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const matchInfo = (metadata as { matchInfo?: unknown }).matchInfo;
  if (!matchInfo || typeof matchInfo !== "object" || Array.isArray(matchInfo)) return {};
  return matchInfo as MatchInfo;
}
