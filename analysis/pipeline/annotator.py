from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

from .common import center_of_bbox, fail, log, log_progress, resize_for_analysis


def build_possession_series(control: list[int]) -> list[tuple[float, float]]:
    team1 = 0
    team2 = 0
    known = 0
    series: list[tuple[float, float]] = []
    for team in control:
        if team in (1, 2):
            known += 1
            if team == 1:
                team1 += 1
            else:
                team2 += 1
        series.append(((team1 / known) * 100 if known else 0.0, (team2 / known) * 100 if known else 0.0))
    return series


def draw_label(cv2: Any, canvas: Any, text: str, origin: tuple[int, int], color: tuple[int, int, int]) -> None:
    x, y = origin
    (label_width, label_height), _baseline = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.44, 1)
    cv2.rectangle(canvas, (x, y - label_height - 8), (x + label_width + 10, y + 4), color, cv2.FILLED)
    cv2.putText(canvas, text, (x + 5, y - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (0, 0, 0), 1, cv2.LINE_AA)


def draw_player_marker(cv2: Any, canvas: Any, bbox: list[float], color: tuple[int, int, int], track_id: int | None = None) -> None:
    x1, _y1, x2, y2 = [int(value) for value in bbox]
    x_center = int((x1 + x2) / 2)
    width = max(18, abs(x2 - x1))
    axes = (max(13, int(width * 0.62)), max(5, int(width * 0.20)))
    ring_center = (x_center, max(0, min(canvas.shape[0] - 1, y2 - 1)))
    shadow = canvas.copy()
    cv2.ellipse(shadow, ring_center, axes, 0, 0, 360, (0, 0, 0), 8, cv2.LINE_AA)
    cv2.addWeighted(shadow, 0.32, canvas, 0.68, 0, canvas)
    cv2.ellipse(canvas, ring_center, axes, 0, 0, 360, (245, 245, 238), 5, cv2.LINE_AA)
    cv2.ellipse(canvas, ring_center, axes, 0, 0, 360, color, 3, cv2.LINE_AA)

    if track_id is None:
        return

    canvas_height, canvas_width = canvas.shape[:2]
    badge_width = max(30, 16 + len(str(track_id)) * 8)
    badge_height = 18
    x1_badge = max(2, min(canvas_width - badge_width - 2, int(x_center - badge_width / 2)))
    y1_badge = y2 + axes[1] + 4
    if y1_badge + badge_height >= canvas_height:
        y1_badge = max(2, y2 - axes[1] - badge_height - 5)
    cv2.rectangle(canvas, (x1_badge, y1_badge), (x1_badge + badge_width, y1_badge + badge_height), (8, 8, 8), cv2.FILLED)
    cv2.rectangle(canvas, (x1_badge, y1_badge), (x1_badge + badge_width, y1_badge + badge_height), color, 2, cv2.LINE_AA)
    cv2.putText(canvas, str(track_id), (x1_badge + 7, y1_badge + 13), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (245, 245, 238), 1, cv2.LINE_AA)


def draw_player_metrics(cv2: Any, canvas: Any, bbox: list[float], player: dict[str, Any]) -> None:
    if not has_player_metrics(player):
        return
    rect = metric_overlay_rect(cv2, canvas, bbox, player)
    if rect is None:
        return
    x1, y1, x2, y2 = rect
    lines = player_metric_lines(player)
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.36
    thickness = 1
    line_height = 13
    overlay = canvas.copy()
    cv2.rectangle(overlay, (x1, y1), (x2, y2), (8, 8, 8), cv2.FILLED)
    cv2.addWeighted(overlay, 0.68, canvas, 0.32, 0, canvas)
    cv2.rectangle(canvas, (x1, y1), (x2, y2), (238, 238, 224), 1, cv2.LINE_AA)
    for index, line in enumerate(lines):
        baseline_y = y1 + 13 + index * line_height
        cv2.putText(canvas, line, (x1 + 5, baseline_y), font, scale, (250, 250, 240), thickness, cv2.LINE_AA)


def metric_overlay_rect(cv2: Any, canvas: Any, bbox: list[float], player: dict[str, Any]) -> tuple[int, int, int, int] | None:
    x1, _y1, x2, y2 = [int(value) for value in bbox]
    x_center = int((x1 + x2) / 2)
    lines = player_metric_lines(player)
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.36
    thickness = 1
    line_height = 13
    widths = [cv2.getTextSize(line, font, scale, thickness)[0][0] for line in lines]
    block_width = max(widths) + 10
    block_height = line_height * len(lines) + 7
    x = max(4, min(canvas.shape[1] - block_width - 4, int(x_center - block_width / 2)))
    y = int(y2 + 34)
    if y + block_height > canvas.shape[0] - 4:
        return None
    if y < y2 + 16:
        return None
    return x, y, x + block_width, y + block_height


def metric_rect_overlaps(rect: tuple[int, int, int, int], others: list[tuple[int, int, int, int]], padding: int = 4) -> bool:
    x1, y1, x2, y2 = rect
    for ox1, oy1, ox2, oy2 in others:
        if x1 - padding <= ox2 and x2 + padding >= ox1 and y1 - padding <= oy2 and y2 + padding >= oy1:
            return True
    return False


def select_metric_overlay_ids(cv2: Any, canvas: Any, players: dict[int, dict[str, Any]]) -> set[int]:
    eligible: set[int] = set()
    for player_id, player in players.items():
        if not has_player_metrics(player):
            continue
        rect = metric_overlay_rect(cv2, canvas, player["bbox"], player)
        if rect is not None:
            eligible.add(player_id)
    return eligible


def has_player_metrics(player: dict[str, Any]) -> bool:
    return bool(player.get("valid_speed_sample") or player.get("display_speed_sample")) and all(
        key in player for key in ("speed", "distance")
    )


def player_metric_lines(player: dict[str, Any]) -> list[str]:
    speed = float(player.get("speed") or 0.0)
    distance = float(player.get("distance") or 0.0)
    return [f"~{speed:.1f} km/h", f"~{format_overlay_distance(distance)}"]


def format_overlay_distance(distance_meters: float) -> str:
    if distance_meters >= 1000:
        return f"{distance_meters / 1000:.2f} km"
    return f"{distance_meters:.0f} m"


def draw_triangle_marker(cv2: Any, np: Any, canvas: Any, bbox: list[float], color: tuple[int, int, int], above: bool = True) -> None:
    x, y = center_of_bbox(bbox)
    if above:
        y = int(bbox[1]) - 5
        points = np.array([[x, y], [x - 10, y - 20], [x + 10, y - 20]])
    else:
        points = np.array([[x, y], [x - 8, y + 16], [x + 8, y + 16]])
    cv2.drawContours(canvas, [points], 0, color, cv2.FILLED)
    cv2.drawContours(canvas, [points], 0, (0, 0, 0), 2, cv2.LINE_AA)


def annotate_frame(frame: Any, frame_num: int, tracks: dict[str, list[dict[int, dict[str, Any]]]], possession_series: list[tuple[float, float]], deps: dict[str, Any]) -> Any:
    cv2 = deps["cv2"]
    np = deps["np"]
    canvas = frame.copy()
    height, width = canvas.shape[:2]
    total_frames = max(1, len(tracks["players"]))
    team1, team2 = possession_series[min(frame_num, len(possession_series) - 1)] if possession_series else (0.0, 0.0)
    orange = (43, 107, 255)
    white = (235, 235, 235)
    gray = (155, 155, 155)
    green = (80, 255, 80)
    cyan = (255, 180, 40)

    overlay = canvas.copy()
    panel_width = min(width - 24, 440)
    cv2.rectangle(overlay, (18, 18), (18 + panel_width, 118), (5, 5, 5), -1)
    cv2.addWeighted(overlay, 0.58, canvas, 0.42, 0, canvas)
    cv2.rectangle(canvas, (18, 18), (18 + panel_width, 118), orange, 1)
    cv2.putText(canvas, "DRIVXIS ANALISIS", (34, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.58, orange, 2, cv2.LINE_AA)
    cv2.putText(canvas, f"EQ1 {team1:05.1f}%   EQ2 {team2:05.1f}%", (34, 76), cv2.FONT_HERSHEY_SIMPLEX, 0.50, white, 1, cv2.LINE_AA)
    cv2.putText(canvas, "VIDEO PROCESADO", (34, 102), cv2.FONT_HERSHEY_SIMPLEX, 0.44, gray, 1, cv2.LINE_AA)

    bar_width = min(width - 70, panel_width - 34)
    progress = (frame_num + 1) / total_frames
    cv2.rectangle(canvas, (34, 108), (34 + bar_width, 112), (42, 42, 42), -1)
    cv2.rectangle(canvas, (34, 108), (34 + int(bar_width * progress), 112), orange, -1)

    players = tracks["players"][frame_num] if frame_num < len(tracks["players"]) else {}
    metric_overlay_ids = select_metric_overlay_ids(cv2, canvas, players)
    for player_id, player in players.items():
        team = int(player.get("team", 1))
        fallback_color = orange if team == 1 else white if team == 2 else gray
        color = tuple(int(channel) for channel in player.get("team_color") or fallback_color)
        draw_player_marker(cv2, canvas, player["bbox"], color, player_id)
        if player.get("isGoalkeeper") or player.get("role") == "goalkeeper":
            x1, y1, _x2, _y2 = [int(value) for value in player["bbox"]]
            draw_label(cv2, canvas, "GK", (x1, max(18, y1)), color)
        if player.get("has_ball"):
            draw_triangle_marker(cv2, np, canvas, player["bbox"], orange, above=True)
        if player_id in metric_overlay_ids:
            draw_player_metrics(cv2, canvas, player["bbox"], player)

    referees = tracks["referees"][frame_num] if frame_num < len(tracks["referees"]) else {}
    for referee_id, referee in referees.items():
        x1, y1, _x2, _y2 = [int(value) for value in referee["bbox"]]
        draw_player_marker(cv2, canvas, referee["bbox"], cyan)
        draw_label(cv2, canvas, f"REF {referee_id}", (x1, max(18, y1)), cyan)

    balls = tracks["ball"][frame_num] if frame_num < len(tracks["ball"]) else {}
    for ball in balls.values():
        x, y = center_of_bbox(ball["bbox"])
        draw_triangle_marker(cv2, np, canvas, ball["bbox"], green, above=False)
        cv2.circle(canvas, (x, y), 14, (0, 0, 0), 4, cv2.LINE_AA)
        cv2.circle(canvas, (x, y), 12, green, 3, cv2.LINE_AA)
        cv2.circle(canvas, (x, y), 4, green, cv2.FILLED)

    return canvas


def write_processed_video(input_path: Path, output_path: Path, video_info: dict[str, Any], tracks: dict[str, list[dict[int, dict[str, Any]]]], control: list[int], deps: dict[str, Any]) -> None:
    cv2 = deps["cv2"]
    imageio_ffmpeg = deps["imageio_ffmpeg"]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    frame_size = video_info["frameSize"]
    fps = float(video_info["fps"] or 24)
    width, height = frame_size
    possession_series = build_possession_series(control)
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    command = [
        ffmpeg_exe, "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-vcodec", "rawvideo", "-pix_fmt", "bgr24",
        "-s", f"{width}x{height}", "-r", f"{fps:.3f}", "-i", "-", "-an", "-vcodec", "libx264", "-preset", "veryfast", "-crf", "23",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output_path),
    ]

    log(f"Writing browser-compatible processed video: {output_path}")
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if process.stdin is None:
        fail("Could not open ffmpeg stdin.")

    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        fail(f"Could not reopen video for processed output: {input_path}")

    frame_num = 0
    try:
        while True:
            ok, source_frame = capture.read()
            if not ok or frame_num >= len(tracks["players"]):
                break
            frame = resize_for_analysis(source_frame, frame_size, deps)
            canvas = annotate_frame(frame, frame_num, tracks, possession_series, deps)
            process.stdin.write(canvas.tobytes())
            frame_num += 1
            if frame_num % 30 == 0:
                log_progress(82 + round((frame_num / max(1, len(tracks["players"]))) * 14), "writing processed video")
            del source_frame
            del frame
            del canvas
    except BrokenPipeError:
        stderr = process.stderr.read().decode("utf-8", errors="replace") if process.stderr else ""
        fail(f"ffmpeg stopped while writing processed video. {stderr}")
    finally:
        capture.release()
        process.stdin.close()

    stdout = process.stdout.read().decode("utf-8", errors="replace") if process.stdout else ""
    stderr = process.stderr.read().decode("utf-8", errors="replace") if process.stderr else ""
    return_code = process.wait()
    if return_code != 0:
        details = "\n".join(part for part in (stdout.strip(), stderr.strip()) if part)
        fail(f"ffmpeg failed to encode processed video with code {return_code}. {details}")

    log(f"Processed video written: {output_path} frames={frame_num} codec=h264 pix_fmt=yuv420p")
