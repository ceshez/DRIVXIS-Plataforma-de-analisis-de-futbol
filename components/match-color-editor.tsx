"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Loader2, Save } from "lucide-react";
import type { AnalysisMetrics } from "@/lib/analysis-metrics";

type MatchColorEditorProps<TVideo> = {
  video: TVideo;
  onSaved: (video: TVideo) => void;
  onToast?: (message: string) => void;
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

type ColorPair = {
  ownTeamColor: string;
  rivalTeamColor: string;
};

export function MatchColorEditor<TVideo extends VideoWithMatch>({
  video,
  onSaved,
  onToast,
}: MatchColorEditorProps<TVideo>) {
  const matchInfo = getVideoMatchInfo(video);
  const detectedColors = video.latestMetrics?.match?.detectedTeamColors;
  const detectedPair = useMemo(() => getDetectedPair(detectedColors), [detectedColors]);
  const initialPair = getInitialPair(matchInfo, detectedPair);
  const [pair, setPair] = useState<ColorPair | null>(initialPair);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    setPair(initialPair);
    setState("idle");
  }, [video.id, initialPair?.ownTeamColor, initialPair?.rivalTeamColor]);

  async function saveColors(nextPair: ColorPair) {
    setState("saving");
    const response = await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matchInfo: nextPair }),
    });
    const data = (await response.json().catch(() => ({}))) as { video?: TVideo };
    if (!response.ok || !data.video) {
      setState("error");
      return;
    }
    onSaved(data.video);
    setState("saved");
    onToast?.("Colores del partido guardados correctamente");
  }

  function swapColors() {
    if (!pair) return;
    const nextPair = {
      ownTeamColor: pair.rivalTeamColor,
      rivalTeamColor: pair.ownTeamColor,
    };
    setPair(nextPair);
    void saveColors(nextPair);
  }

  return (
    <div className="match-color-editor" aria-label="Colores de equipos detectados">
      <div className="match-color-editor__copy">
        <span>Colores del partido</span>
        <strong>
          {matchInfo.ownTeam ?? "Equipo propio"} / {matchInfo.rivalTeam ?? "Equipo rival"}
        </strong>
        {detectedPair ? (
          <small>
            Detectados por el an?lisis
            {detectedColors?.tentative ? " � tentativos" : ""}
          </small>
        ) : (
          <small>Sin colores detectados aun</small>
        )}
      </div>

      {pair ? (
        <>
          <ColorSwatch label="Equipo propio" color={pair.ownTeamColor} />
          <button
            className="match-color-swap"
            type="button"
            aria-label="Intercambiar colores de equipo propio y rival"
            onClick={swapColors}
            disabled={state === "saving" || !detectedPair}
            title="Intercambiar"
          >
            {state === "saving" ? <Loader2 className="spin" size={15} /> : <ArrowLeftRight size={15} />}
          </button>
          <ColorSwatch label="Equipo rival" color={pair.rivalTeamColor} />
        </>
      ) : (
        <div className="match-color-empty">El an?lisis debe detectar dos colores antes de permitir intercambio.</div>
      )}

      <button
        className={`match-color-save ${state === "saved" ? "is-saved" : ""} ${state === "error" ? "is-error" : ""}`}
        type="button"
        aria-label="Guardar"
        title="Guardar"
        onClick={() => pair && void saveColors(pair)}
        disabled={state === "saving" || !pair || !detectedPair}
      >
        {state === "saving" ? <Loader2 className="spin" size={14} /> : <Save size={14} />}
      </button>
    </div>
  );
}

function ColorSwatch({ label, color }: { label: string; color: string }) {
  return (
    <div className="match-color-swatch">
      <span>{label}</span>
      <b style={{ background: color }} aria-hidden="true" />
      <small>{color}</small>
    </div>
  );
}

function getInitialPair(matchInfo: MatchInfo, detectedPair: ColorPair | null): ColorPair | null {
  if (!detectedPair) return null;
  const ownTeamColor = normalizeHex(matchInfo.ownTeamColor);
  const rivalTeamColor = normalizeHex(matchInfo.rivalTeamColor);
  if (ownTeamColor && rivalTeamColor && isDetectedPair({ ownTeamColor, rivalTeamColor }, detectedPair)) {
    return { ownTeamColor, rivalTeamColor };
  }
  return detectedPair;
}

function getDetectedPair(colors: NonNullable<AnalysisMetrics["match"]>["detectedTeamColors"] | undefined): ColorPair | null {
  const ownTeamColor = normalizeHex(colors?.team1);
  const rivalTeamColor = normalizeHex(colors?.team2);
  if (!ownTeamColor || !rivalTeamColor || ownTeamColor === rivalTeamColor) return null;
  return { ownTeamColor, rivalTeamColor };
}

function isDetectedPair(pair: ColorPair, detectedPair: ColorPair) {
  const normal = pair.ownTeamColor === detectedPair.ownTeamColor && pair.rivalTeamColor === detectedPair.rivalTeamColor;
  const swapped = pair.ownTeamColor === detectedPair.rivalTeamColor && pair.rivalTeamColor === detectedPair.ownTeamColor;
  return normal || swapped;
}

function normalizeHex(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

function getVideoMatchInfo(video: VideoWithMatch): MatchInfo {
  const metadata = video.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const matchInfo = (metadata as { matchInfo?: unknown }).matchInfo;
  if (!matchInfo || typeof matchInfo !== "object" || Array.isArray(matchInfo)) return {};
  return matchInfo as MatchInfo;
}
