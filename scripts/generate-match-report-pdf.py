#!/usr/bin/env python
"""Renders a branded DRIVXIS match-analysis PDF from JSON received on stdin."""

from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path

import reportlab
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

PAGE_WIDTH, PAGE_HEIGHT = A4
BACKGROUND = HexColor("#080808")
PANEL = HexColor("#10100f")
ACCENT = HexColor("#ff6b2b")
TEXT = HexColor("#f2f0ee")
MUTED = HexColor("#8b8783")
GRID = HexColor("#1a1715")
FONT_DIRECTORY = Path(reportlab.__file__).parent / "fonts"
FONT_REGULAR = "DRIVXISVera"
FONT_BOLD = "DRIVXISVeraBold"

pdfmetrics.registerFont(TTFont(FONT_REGULAR, str(FONT_DIRECTORY / "Vera.ttf")))
pdfmetrics.registerFont(TTFont(FONT_BOLD, str(FONT_DIRECTORY / "VeraBd.ttf")))


def format_number(value: object, suffix: str = "") -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = 0.0
    return f"{number:.1f}{suffix}"


def format_duration(seconds: object) -> str:
    try:
        total = max(0, round(float(seconds)))
    except (TypeError, ValueError):
        total = 0
    return f"{total // 60} min {total % 60:02d} s"


def truncate(value: object, length: int = 72) -> str:
    text = str(value or "").strip()
    return text if len(text) <= length else f"{text[: length - 3]}..."


def draw_grid(pdf: canvas.Canvas) -> None:
    pdf.setStrokeColor(GRID)
    pdf.setLineWidth(0.35)
    for x in range(0, int(PAGE_WIDTH) + 1, 22):
        pdf.line(x, 0, x, PAGE_HEIGHT)
    for y in range(0, int(PAGE_HEIGHT) + 1, 22):
        pdf.line(0, y, PAGE_WIDTH, y)


def draw_logo(pdf: canvas.Canvas, logo_path: str, x: float, y: float) -> None:
    path = Path(logo_path)
    if path.is_file():
        pdf.drawImage(str(path), x, y, width=27, height=27, mask="auto", preserveAspectRatio=True, anchor="c")
    else:
        pdf.setStrokeColor(TEXT)
        pdf.setLineWidth(2.5)
        pdf.line(x + 3, y + 4, x + 23, y + 23)
        pdf.line(x + 8, y + 3, x + 24, y + 19)


def draw_stat_card(pdf: canvas.Canvas, x: float, y: float, width: float, label: str, own_team: str, own_value: str, rival_team: str, rival_value: str) -> None:
    pdf.setFillColor(PANEL)
    pdf.setStrokeColor(HexColor("#3a2418"))
    pdf.rect(x, y, width, 82, fill=1, stroke=1)
    pdf.setFillColor(ACCENT)
    pdf.rect(x, y + 78, width, 4, fill=1, stroke=0)
    pdf.setFillColor(MUTED)
    pdf.setFont(FONT_BOLD, 7)
    pdf.drawString(x + 14, y + 61, label.upper())
    pdf.setFillColor(TEXT)
    pdf.setFont(FONT_BOLD, 19)
    pdf.drawString(x + 14, y + 31, own_value)
    pdf.setFillColor(MUTED)
    pdf.setFont(FONT_REGULAR, 7.5)
    pdf.drawString(x + 14, y + 17, truncate(own_team, 26))
    pdf.setFillColor(TEXT)
    pdf.setFont(FONT_BOLD, 19)
    pdf.drawRightString(x + width - 14, y + 31, rival_value)
    pdf.setFillColor(MUTED)
    pdf.setFont(FONT_REGULAR, 7.5)
    pdf.drawRightString(x + width - 14, y + 17, truncate(rival_team, 26))


def draw_section_heading(pdf: canvas.Canvas, x: float, y: float, width: float, number: str, title: str) -> None:
    pdf.setStrokeColor(HexColor("#3a2418"))
    pdf.setLineWidth(0.7)
    pdf.line(x, y + 7, x + width, y + 7)
    pdf.setFillColor(ACCENT)
    pdf.setFont(FONT_BOLD, 7)
    pdf.drawString(x, y - 7, number)
    pdf.setFillColor(TEXT)
    pdf.setFont(FONT_BOLD, 8)
    pdf.drawString(x + 20, y - 7, title.upper())


def draw_detail_tile(pdf: canvas.Canvas, x: float, y: float, width: float, label: str, value: str, detail: str) -> None:
    pdf.setFillColor(PANEL)
    pdf.setStrokeColor(HexColor("#29201b"))
    pdf.rect(x, y, width, 45, fill=1, stroke=1)
    pdf.setFillColor(MUTED)
    pdf.setFont(FONT_BOLD, 6.4)
    pdf.drawString(x + 10, y + 31, label.upper())
    pdf.setFillColor(TEXT)
    pdf.setFont(FONT_BOLD, 10.5)
    pdf.drawString(x + 10, y + 16, truncate(value, 34))
    if detail:
        pdf.setFillColor(MUTED)
        pdf.setFont(FONT_REGULAR, 6.6)
        pdf.drawRightString(x + width - 10, y + 16, truncate(detail, 32))


def draw_wrapped(pdf: canvas.Canvas, text: str, x: float, y: float, width: float, font_size: float = 9.5, leading: float = 15) -> float:
    words = text.split()
    line = ""
    pdf.setFont(FONT_REGULAR, font_size)
    for word in words:
        candidate = f"{line} {word}".strip()
        if line and pdf.stringWidth(candidate, FONT_REGULAR, font_size) > width:
            pdf.drawString(x, y, line)
            y -= leading
            line = word
        else:
            line = candidate
    if line:
        pdf.drawString(x, y, line)
        y -= leading
    return y


def build_pdf(payload: dict) -> bytes:
    report = payload.get("report") or {}
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4, pageCompression=1)
    pdf.setTitle("DRIVXIS - Reporte de análisis")
    pdf.setAuthor("DRIVXIS")

    pdf.setFillColor(BACKGROUND)
    pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    draw_grid(pdf)

    margin = 42
    draw_logo(pdf, str(payload.get("logoPath") or ""), margin, PAGE_HEIGHT - 68)
    pdf.setFillColor(TEXT)
    pdf.setFont(FONT_BOLD, 20)
    pdf.drawString(margin + 38, PAGE_HEIGHT - 49, "DRIVXIS")
    pdf.setFillColor(MUTED)
    pdf.setFont(FONT_BOLD, 7)
    pdf.drawString(margin + 39, PAGE_HEIGHT - 62, "FOOTBALL VIDEO INTELLIGENCE")
    pdf.setStrokeColor(ACCENT)
    pdf.setLineWidth(2)
    pdf.line(margin, PAGE_HEIGHT - 84, PAGE_WIDTH - margin, PAGE_HEIGHT - 84)

    full_width = PAGE_WIDTH - (margin * 2)
    stat_teams = report.get("statTeams") or {}
    primary_team = str(stat_teams.get("primary") or report.get("ownTeam") or "Equipo 1")
    secondary_team = str(stat_teams.get("secondary") or report.get("rivalTeam") or "Equipo 2")
    mapping = report.get("teamMapping") or {}
    coverage = report.get("coverage") or {}

    pdf.setFillColor(ACCENT)
    pdf.setFont(FONT_BOLD, 8)
    pdf.drawString(margin, PAGE_HEIGHT - 111, "REPORTE DE ANÁLISIS")
    pdf.setFillColor(TEXT)
    pdf.setFont(FONT_BOLD, 22)
    pdf.drawString(margin, PAGE_HEIGHT - 146, f"{truncate(report.get('ownTeam', 'Equipo 1'), 18)} vs {truncate(report.get('rivalTeam', 'Equipo 2'), 18)}")
    pdf.setFillColor(MUTED)
    pdf.setFont(FONT_REGULAR, 8)
    pdf.drawRightString(PAGE_WIDTH - margin, PAGE_HEIGHT - 114, "GENERADO POR EL MOTOR DE ANÁLISIS")
    pdf.drawRightString(PAGE_WIDTH - margin, PAGE_HEIGHT - 130, truncate(report.get("originalFilename", ""), 48))

    mapping_y = PAGE_HEIGHT - 212
    pdf.setFillColor(PANEL)
    pdf.setStrokeColor(HexColor("#3a2418") if not mapping.get("confirmed") else HexColor("#25402b"))
    pdf.rect(margin, mapping_y, full_width, 35, fill=1, stroke=1)
    pdf.setFillColor(ACCENT if not mapping.get("confirmed") else HexColor("#8fe388"))
    pdf.setFont(FONT_BOLD, 7)
    pdf.drawString(margin + 12, mapping_y + 21, "ASIGNACIÓN DE EQUIPOS")
    pdf.setFillColor(TEXT)
    pdf.setFont(FONT_REGULAR, 7.4)
    mapping_status = "Confirmada: las métricas están asociadas a los clubes por sus colores detectados." if mapping.get("confirmed") else "Revisión sugerida: confirma que el orden de los equipos coincida con el video."
    pdf.drawString(margin + 12, mapping_y + 9, mapping_status)

    draw_section_heading(pdf, margin, PAGE_HEIGHT - 234, full_width, "01", "Control y actividad")
    draw_stat_card(
        pdf,
        margin,
        PAGE_HEIGHT - 330,
        full_width,
        "Control del balón",
        primary_team,
        format_number((report.get("possession") or {}).get("primary"), "%"),
        secondary_team,
        format_number((report.get("possession") or {}).get("secondary"), "%"),
    )
    draw_stat_card(
        pdf,
        margin,
        PAGE_HEIGHT - 424,
        full_width,
        "Distancia recorrida",
        primary_team,
        format_number((report.get("distanceKm") or {}).get("primary"), " km"),
        secondary_team,
        format_number((report.get("distanceKm") or {}).get("secondary"), " km"),
    )

    draw_section_heading(pdf, margin, PAGE_HEIGHT - 420, full_width, "02", "Cobertura del análisis")
    tile_width = (full_width - 8) / 2
    speed = report.get("speed")
    speed_value = f"{format_number(speed.get('maxKmh'))} km/h" if isinstance(speed, dict) else "No validada"
    speed_detail = f"Media {format_number(speed.get('avgKmh'))} km/h" if isinstance(speed, dict) else "Calibración insuficiente"
    ball_value = f"{format_number(coverage.get('ballDetectionPct'))}%" if coverage.get("ballDetectionPct") is not None else "Sin dato"
    possession_value = f"{format_number(coverage.get('possessionCoveragePct'))}%" if coverage.get("possessionCoveragePct") is not None else "Sin dato"
    color_detail = f"Colores: {format_number(coverage.get('teamColorConfidencePct'))}% confianza" if coverage.get("teamColorConfidencePct") is not None else "Colores sin dato"
    draw_detail_tile(pdf, margin, PAGE_HEIGHT - 517, tile_width, "Muestra de video", format_duration(report.get("durationSeconds")), f"{coverage.get('frameCount', 0)} fotogramas · {format_number(coverage.get('fps'))} FPS")
    draw_detail_tile(pdf, margin + tile_width + 8, PAGE_HEIGHT - 517, tile_width, "Partido analizado", f"{truncate(primary_team, 16)} vs {truncate(secondary_team, 16)}", "Nombres configurados")
    draw_detail_tile(pdf, margin, PAGE_HEIGHT - 569, tile_width, "Cobertura del balón", ball_value, "Fotogramas con balón detectado")
    draw_detail_tile(pdf, margin + tile_width + 8, PAGE_HEIGHT - 569, tile_width, "Posesión asignada", possession_value, f"{coverage.get('possessionAssignedFrames', 0) or 0} fotogramas asignados")
    draw_detail_tile(pdf, margin, PAGE_HEIGHT - 621, tile_width, "Velocidad", speed_value, speed_detail)
    draw_detail_tile(pdf, margin + tile_width + 8, PAGE_HEIGHT - 621, tile_width, "Recorrido total", format_number((report.get("distanceKm") or {}).get("total"), " km"), color_detail)

    draw_section_heading(pdf, margin, PAGE_HEIGHT - 650, full_width, "03", "Lectura del partido")
    pdf.setFillColor(TEXT)
    lines_y = PAGE_HEIGHT - 678
    for insight in report.get("insights") or []:
        pdf.setFillColor(ACCENT)
        pdf.circle(margin + 3, lines_y + 3, 1.7, fill=1, stroke=0)
        pdf.setFillColor(TEXT)
        lines_y = draw_wrapped(pdf, str(insight).lstrip("- "), margin + 13, lines_y, full_width - 13, 8.4, 11)
        lines_y -= 2

    pdf.setFillColor(MUTED)
    pdf.setFont(FONT_REGULAR, 7.2)
    note = "Las métricas se generan automáticamente a partir del video. Revisa la asignación de equipos antes de usar comparaciones por club."
    draw_wrapped(pdf, note, margin, 92, full_width, 7.2, 10)
    pdf.setStrokeColor(HexColor("#3a2418"))
    pdf.line(margin, 70, PAGE_WIDTH - margin, 70)
    pdf.setFillColor(MUTED)
    pdf.setFont(FONT_BOLD, 6.8)
    pdf.drawString(margin, 54, "DRIVXIS ANALYSIS SYSTEM")
    pdf.drawRightString(PAGE_WIDTH - margin, 54, "REPORTE 01 / 01")
    pdf.save()
    return buffer.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", help="Optional PDF destination for local visual verification.")
    args = parser.parse_args()
    payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    pdf_bytes = build_pdf(payload)
    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(pdf_bytes)
    else:
        sys.stdout.buffer.write(pdf_bytes)


if __name__ == "__main__":
    main()
