from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from analysis.pipeline.annotator import write_processed_video
from analysis.pipeline.ball import assign_ball_control, interpolate_ball_positions
from analysis.pipeline.calibration import build_calibration
from analysis.pipeline.common import fail, get_video_info, load_runtime_dependencies, log, log_progress, parse_match_info
from analysis.pipeline.goalkeepers import assign_goalkeeper_teams
from analysis.pipeline.metrics import build_metrics
from analysis.pipeline.reid import assign_stable_player_ids
from analysis.pipeline.speed_distance import add_speed_and_distance
from analysis.pipeline.tracker import process_video_pass


def run(input_path: Path, output_path: Path, metrics_path: Path, model_path: Path, match_info: dict) -> None:
    log("Starting football analysis")
    log(f"Input={input_path}")
    log(f"Output={output_path}")
    log(f"Metrics={metrics_path}")
    log(f"Model={model_path}")
    if match_info:
        log("Match info: " f"ownTeam={match_info.get('ownTeam') or 'Equipo 1'} " f"rivalTeam={match_info.get('rivalTeam') or 'Equipo 2'}")
    if not input_path.exists():
        fail(f"Input video does not exist: {input_path}")
    if not model_path.exists():
        fail(f"Missing YOLO model at {model_path}. Download best.pt into analysis/models/best.pt")

    deps = load_runtime_dependencies()
    log("Runtime dependencies loaded")
    log_progress(8, "opening video")
    video_info = get_video_info(input_path, deps)
    calibration = build_calibration(video_info["frameSize"], deps)
    log(f"Calibration: {json.dumps({'status': calibration['calibrationStatus'], 'confidence': calibration.get('confidence'), 'pitch': calibration['pitch']})}")
    log_progress(12, "loading model")

    analysis = process_video_pass(input_path, model_path, video_info, calibration, match_info, deps)
    tracks = analysis["tracks"]
    tracking_quality = assign_stable_player_ids(tracks, float(video_info["fps"]), video_info["frameSize"])
    log(
        "Stable player IDs: "
        f"displayPlayers={tracking_quality['displayPlayers']} "
        f"sourceTracks={tracking_quality['sourceTracks']} "
        f"remappedSources={tracking_quality['remappedSources']} "
        f"fragmentationRatio={tracking_quality['fragmentationRatio']} "
        f"confidence={tracking_quality['confidence']}"
    )

    goalkeeper_quality = assign_goalkeeper_teams(tracks)
    if goalkeeper_quality["detected"]:
        log(
            "Goalkeepers: "
            f"detected={goalkeeper_quality['detected']} "
            f"assigned={goalkeeper_quality['assigned']} "
            f"items={goalkeeper_quality['items']}"
        )

    log("Interpolating ball positions")
    ball_quality = interpolate_ball_positions(tracks)

    log("Assigning ball control")
    log_progress(72, "assigning possession")
    ball_control, possession_quality = assign_ball_control(tracks, video_info["frameSize"])

    log("Calculating speed and distance with quality gates")
    log_progress(76, "calculating metrics")
    speed_quality = add_speed_and_distance(tracks, float(video_info["fps"]), calibration)
    log(
        "Speed quality: "
        f"valid={speed_quality['validSamples']} "
        f"rejected={speed_quality['rejectedSamples']} "
        f"confidence={speed_quality['confidence']} "
        f"untrustedPlayers={len(speed_quality['untrustedPlayers'])} "
        f"reasons={speed_quality['rejectionReasons']}"
    )

    log_progress(82, "writing processed video")
    write_processed_video(input_path, output_path, video_info, tracks, ball_control, deps)

    log_progress(97, "writing metrics")
    metrics = build_metrics(
        tracks,
        ball_control,
        float(video_info["fps"]),
        speed_quality,
        tracking_quality,
        goalkeeper_quality,
        ball_quality,
        possession_quality,
        match_info,
        analysis.get("detectedTeamColors", {}),
    )
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    log(
        "Metrics written: "
        f"playersDetected={metrics['players']['detected']} "
        f"frames={metrics['video']['frameCount']} "
        f"ballControlOwn={metrics['ballControl']['ownTeam']} "
        f"ballControlRival={metrics['ballControl']['rivalTeam']} "
        f"validSamples={metrics['speed']['validSamples']} "
        f"rejectedSamples={metrics['speed']['rejectedSamples']} "
        f"ownDistanceMeters={metrics['teamDistances']['ownTeam']} "
        f"rivalDistanceMeters={metrics['teamDistances']['rivalTeam']}"
    )
    log("Analysis completed successfully")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run DRIVXIS football video analysis.")
    parser.add_argument("--input", required=True, type=Path, help="Source video path.")
    parser.add_argument("--output", required=True, type=Path, help="Processed H.264 MP4 output path.")
    parser.add_argument("--metrics-json", required=True, type=Path, help="Metrics JSON output path.")
    parser.add_argument("--model", required=True, type=Path, help="YOLO model path.")
    parser.add_argument("--match-info", default="", help="JSON with ownTeam, rivalTeam and shirt colors.")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run(args.input, args.output, args.metrics_json, args.model, parse_match_info(args.match_info))
