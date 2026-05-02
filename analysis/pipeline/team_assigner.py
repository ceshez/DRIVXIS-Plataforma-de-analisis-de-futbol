from __future__ import annotations

from typing import Any

from .common import DEFAULT_TEAM_COLORS_BGR, bbox_iou, bbox_width, bgr_to_hex, build_color_anchors, center_of_bbox, measure_distance


AMBIGUOUS_COLOR_MARGIN = 14.0
KEEP_PREVIOUS_MARGIN = 24.0
STRONG_SWITCH_MARGIN = 36.0
STRONG_SWITCH_CONFIDENCE = 0.55
TEAM_SWITCH_STREAK_FRAMES = 6
TEAM_LOCK_VOTE_FRAMES = 4
OCCLUSION_IOU_THRESHOLD = 0.06
OCCLUSION_MIN_AREA_RATIO = 0.16


class TeamAssigner:
    def __init__(self, kmeans_cls: Any, color_anchors: dict[int, Any] | None = None) -> None:
        self.kmeans_cls = kmeans_cls
        self.kmeans = None
        self.team_colors: dict[int, Any] = {}
        self.player_team: dict[int, int] = {}
        self.player_team_votes: dict[int, dict[int, int]] = {}
        self.color_anchors = color_anchors or {}
        self.color_samples: list[Any] = []
        self.sample_count = 0
        self.last_fit_sample_count = 0
        self.color_confidence = 0.0
        self.contaminated_players: set[int] = set()
        self.player_switch_streak: dict[int, tuple[int, int]] = {}
        self.player_locked_team: dict[int, int] = {}

    @classmethod
    def from_match_info(cls, kmeans_cls: Any, match_info: dict[str, Any]) -> "TeamAssigner":
        return cls(kmeans_cls, build_color_anchors(match_info))

    def get_player_color(self, frame: Any, bbox: list[float]) -> Any | None:
        cv2 = self._cv2_from_frame(frame)
        height, width = frame.shape[:2]
        x1, y1, x2, y2 = [float(value) for value in bbox]
        box_width = max(1.0, x2 - x1)
        box_height = max(1.0, y2 - y1)

        crop_x1 = max(0, min(width - 1, int(x1)))
        crop_x2 = max(0, min(width, int(x2)))
        crop_y1 = max(0, min(height - 1, int(y1)))
        crop_y2 = max(0, min(height, int(y1 + box_height * 0.58)))
        if crop_x2 <= crop_x1 or crop_y2 <= crop_y1:
            return None

        crop_specs = (
            (0.00, 1.00, 0.00, 0.58),
            (0.18, 0.82, 0.10, 0.62),
            (0.24, 0.76, 0.16, 0.54),
            (0.12, 0.88, 0.18, 0.70),
        )
        candidates: list[tuple[float, Any]] = []
        for left, right, top, bottom in crop_specs:
            roi_x1 = max(0, min(width - 1, int(x1 + box_width * left)))
            roi_x2 = max(0, min(width, int(x1 + box_width * right)))
            roi_y1 = max(0, min(height - 1, int(y1 + box_height * top)))
            roi_y2 = max(0, min(height, int(y1 + box_height * bottom)))
            if roi_x2 <= roi_x1 or roi_y2 <= roi_y1:
                continue
            crop = frame[roi_y1:roi_y2, roi_x1:roi_x2]
            if crop.size == 0 or crop.shape[0] < 4 or crop.shape[1] < 3:
                continue
            scored = self._foreground_cluster_color(crop)
            if scored is not None:
                candidates.append(scored)
            fallback = self._dominant_uniform_color(crop, cv2)
            if fallback is not None:
                candidates.append((fallback[0] * 0.82, fallback[1]))

        if not candidates:
            return None
        return max(candidates, key=lambda item: item[0])[1]

    def _foreground_cluster_color(self, image: Any) -> tuple[float, Any] | None:
        pixels = image.reshape(-1, 3)
        if len(pixels) < 8:
            return None
        clusters = min(3, len(pixels))
        if clusters < 2:
            return None
        kmeans = self.kmeans_cls(n_clusters=clusters, init="k-means++", n_init=1, random_state=7)
        kmeans.fit(pixels)
        labels = kmeans.labels_.reshape(image.shape[0], image.shape[1])
        corner_clusters = [int(labels[0, 0]), int(labels[0, -1]), int(labels[-1, 0]), int(labels[-1, -1])]
        background_cluster = max(set(corner_clusters), key=corner_clusters.count)
        foreground_clusters = [index for index in range(clusters) if index != background_cluster]
        if not foreground_clusters:
            return None
        central = labels[
            max(0, int(image.shape[0] * 0.18)) : max(1, int(image.shape[0] * 0.82)),
            max(0, int(image.shape[1] * 0.18)) : max(1, int(image.shape[1] * 0.82)),
        ]
        total_pixels = float(labels.size)
        central_pixels = float(max(1, central.size))

        def cluster_score(index: int) -> float:
            total_ratio = float((labels == index).sum()) / total_pixels
            central_ratio = float((central == index).sum()) / central_pixels
            saturation = self._saturation_score(kmeans.cluster_centers_[index])
            brightness = self._brightness_score(kmeans.cluster_centers_[index])
            white_bonus = 0.18 if saturation < 0.18 and brightness > 0.58 else 0.0
            return central_ratio * 0.62 + total_ratio * 0.24 + saturation * 0.08 + white_bonus

        chosen = max(foreground_clusters, key=cluster_score)
        return cluster_score(chosen), kmeans.cluster_centers_[chosen]

    def _dominant_uniform_color(self, image: Any, cv2: Any | None) -> tuple[float, Any] | None:
        pixels = image.reshape(-1, 3)
        if cv2 is not None:
            hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV).reshape(-1, 3)
            hue = hsv[:, 0]
            sat = hsv[:, 1]
            val = hsv[:, 2]
            green = (hue >= 35) & (hue <= 95) & (sat > 70) & (val < 190)
            too_dark = val < 28
            washed_highlight = (sat < 12) & (val > 248)
            mask = ~(green | too_dark | washed_highlight)
            filtered = pixels[mask]
            if len(filtered) >= 8:
                pixels = filtered
        clusters = min(2, len(pixels))
        if clusters < 2:
            return None
        kmeans = self.kmeans_cls(n_clusters=clusters, init="k-means++", n_init=1, random_state=7)
        kmeans.fit(pixels)
        centers = kmeans.cluster_centers_
        labels = kmeans.labels_
        counts = [(labels == index).sum() for index in range(clusters)]
        chosen = max(range(clusters), key=lambda index: (counts[index], self._saturation_score(centers[index]), self._brightness_score(centers[index])))
        score = counts[chosen] / max(1, len(labels))
        return score, centers[chosen]

    def mark_contaminated_tracks(self, player_tracks: dict[int, dict[str, Any]]) -> None:
        self.contaminated_players = set()
        ids = list(player_tracks)
        for index, first_id in enumerate(ids):
            first_bbox = player_tracks[first_id].get("bbox")
            if not first_bbox:
                continue
            for second_id in ids[index + 1 :]:
                second_bbox = player_tracks[second_id].get("bbox")
                if not second_bbox:
                    continue
                if self._bboxes_contaminate_color(first_bbox, second_bbox):
                    self.contaminated_players.add(first_id)
                    self.contaminated_players.add(second_id)

        for player_id, player in player_tracks.items():
            if player_id in self.contaminated_players:
                player["team_color_contaminated"] = True

    def _bboxes_contaminate_color(self, first: list[float], second: list[float]) -> bool:
        ax1, ay1, ax2, ay2 = [float(value) for value in first[:4]]
        bx1, by1, bx2, by2 = [float(value) for value in second[:4]]
        overlap_width = max(0.0, min(ax2, bx2) - max(ax1, bx1))
        overlap_height = max(0.0, min(ay2, by2) - max(ay1, by1))
        intersection = overlap_width * overlap_height
        first_area = max(1.0, (ax2 - ax1) * (ay2 - ay1))
        second_area = max(1.0, (bx2 - bx1) * (by2 - by1))
        min_area_ratio = intersection / min(first_area, second_area)
        if bbox_iou(first, second) >= OCCLUSION_IOU_THRESHOLD or min_area_ratio >= OCCLUSION_MIN_AREA_RATIO:
            return True
        first_center = center_of_bbox(first)
        second_center = center_of_bbox(second)
        center_distance = measure_distance(first_center, second_center)
        vertical_overlap = overlap_height / max(1.0, min(ay2 - ay1, by2 - by1))
        close_threshold = max(16.0, max(bbox_width(first), bbox_width(second)) * 0.9)
        return center_distance <= close_threshold and vertical_overlap >= 0.42

    def collect_samples(self, frame: Any, player_tracks: dict[int, dict[str, Any]], max_samples: int = 180) -> None:
        if self.color_anchors:
            return
        for player_id, player in player_tracks.items():
            if player.get("isGoalkeeper") or player.get("role") == "goalkeeper":
                continue
            if player_id in self.contaminated_players or player.get("team_color_contaminated"):
                continue
            if self.sample_count >= max_samples:
                break
            color = self.get_player_color(frame, player["bbox"])
            if color is not None:
                self.color_samples.append(color)
                self.sample_count += 1
        if len(self.color_samples) >= 8 and (self.kmeans is None or self.sample_count - self.last_fit_sample_count >= 24):
            self._fit_team_colors(self.color_samples)

    def assign_team_colors(self, frame: Any, player_tracks: dict[int, dict[str, Any]]) -> None:
        self.mark_contaminated_tracks(player_tracks)
        self.collect_samples(frame, player_tracks)

    def _fit_team_colors(self, player_colors: list[Any]) -> None:
        self.kmeans = self.kmeans_cls(n_clusters=2, init="k-means++", n_init=10, random_state=11)
        self.kmeans.fit(player_colors)
        centers = [self.kmeans.cluster_centers_[0], self.kmeans.cluster_centers_[1]]
        labels = self.kmeans.labels_
        counts = [(labels == index).sum() for index in range(2)]
        separation = measure_distance(centers[0], centers[1])
        balance = min(counts) / max(1, max(counts))
        self.color_confidence = max(0.0, min(1.0, (separation / 95.0) * 0.7 + balance * 0.3))

        if 1 in self.color_anchors and 2 in self.color_anchors:
            first_center_for_home = measure_distance(centers[0], self.color_anchors[1]) + measure_distance(centers[1], self.color_anchors[2])
            second_center_for_home = measure_distance(centers[1], self.color_anchors[1]) + measure_distance(centers[0], self.color_anchors[2])
            if second_center_for_home < first_center_for_home:
                centers = [centers[1], centers[0]]
        elif 1 in self.team_colors and 2 in self.team_colors:
            keep_order = measure_distance(centers[0], self.team_colors[1]) + measure_distance(centers[1], self.team_colors[2])
            swap_order = measure_distance(centers[1], self.team_colors[1]) + measure_distance(centers[0], self.team_colors[2])
            if swap_order < keep_order:
                centers = [centers[1], centers[0]]
        self.team_colors[1] = centers[0]
        self.team_colors[2] = centers[1]
        self.last_fit_sample_count = self.sample_count

    def get_player_team_info(self, frame: Any, bbox: list[float], player_id: int) -> dict[str, Any]:
        if player_id in self.contaminated_players:
            previous_team = self.player_team.get(player_id, self.player_locked_team.get(player_id, 1))
            return {"team": previous_team, "team_confidence": 0.0, "team_assignment_state": "occluded_keep_previous"}

        color = self.get_player_color(frame, bbox)
        if color is None:
            return {"team": self.player_team.get(player_id, 1)}

        if self.color_anchors:
            distances = {team_id: color_distance(color, anchor) for team_id, anchor in self.color_anchors.items()}
            team = min(distances.keys(), key=lambda team_id: distances[team_id])
        elif self.kmeans is not None and self.team_colors:
            distances = {team_id: color_distance(color, self.team_colors[team_id]) for team_id in self.team_colors}
            team = 1 if distances.get(1, float("inf")) <= distances.get(2, float("inf")) else 2
        else:
            return {"team": self.player_team.get(player_id, 1), "jersey_color": tuple(float(channel) for channel in color[:3])}

        ordered_distances = sorted(distances.values())
        confidence = 0.0
        margin = 0.0
        if len(ordered_distances) > 1:
            margin = ordered_distances[1] - ordered_distances[0]
            confidence = max(0.0, min(1.0, margin / 65.0))
        stable_team = self._stabilize_team_assignment(player_id, team, distances, margin, confidence)
        return {
            "team": stable_team,
            "jersey_color": tuple(float(channel) for channel in color[:3]),
            "team_color_distance": float(distances.get(stable_team, 0.0)),
            "nearest_color_distance": float(min(distances.values())) if distances else 0.0,
            "other_color_distance": float(max(distances.values())) if len(distances) > 1 else 0.0,
            "team_confidence": round(confidence, 3),
        }

    def _stabilize_team_assignment(
        self,
        player_id: int,
        detected_team: int,
        distances: dict[int, float],
        margin: float,
        confidence: float,
    ) -> int:
        previous_team = self.player_team.get(player_id)
        locked_team = self.player_locked_team.get(player_id)
        switch_allowed = False

        if previous_team is not None:
            previous_distance = distances.get(previous_team, float("inf"))
            best_distance = min(distances.values()) if distances else previous_distance
            keep_previous = margin < AMBIGUOUS_COLOR_MARGIN or previous_distance <= best_distance + KEEP_PREVIOUS_MARGIN
            if detected_team != previous_team:
                strong_switch = (
                    confidence >= STRONG_SWITCH_CONFIDENCE
                    and margin >= STRONG_SWITCH_MARGIN
                    and previous_distance > best_distance + STRONG_SWITCH_MARGIN
                )
                streak_team, streak_count = self.player_switch_streak.get(player_id, (detected_team, 0))
                streak_count = streak_count + 1 if streak_team == detected_team and strong_switch else 1 if strong_switch else 0
                self.player_switch_streak[player_id] = (detected_team, streak_count)
                if not strong_switch or streak_count < TEAM_SWITCH_STREAK_FRAMES:
                    return locked_team or previous_team
                switch_allowed = True
            elif keep_previous or detected_team == previous_team:
                self.player_switch_streak.pop(player_id, None)

        votes = self.player_team_votes.setdefault(player_id, {})
        if switch_allowed:
            votes.clear()
            self.player_locked_team.pop(player_id, None)
        votes[detected_team] = votes.get(detected_team, 0) + 1
        stable_team = max(votes.items(), key=lambda item: (item[1], -item[0]))[0]
        if sum(votes.values()) >= TEAM_LOCK_VOTE_FRAMES:
            self.player_locked_team[player_id] = stable_team
        self.player_team[player_id] = stable_team
        return stable_team

    def get_player_team(self, frame: Any, bbox: list[float], player_id: int) -> int:
        return int(self.get_player_team_info(frame, bbox, player_id)["team"])

    def get_draw_color(self, team: int) -> tuple[int, int, int]:
        if team in self.color_anchors:
            return tuple(int(channel) for channel in self.color_anchors[team])
        if team in self.team_colors:
            return tuple(int(channel) for channel in self.team_colors[team])
        return DEFAULT_TEAM_COLORS_BGR.get(team, DEFAULT_TEAM_COLORS_BGR[1])

    def get_detected_colors(self) -> dict[str, Any]:
        colors: dict[str, Any] = {
            "confidence": round(float(self.color_confidence if not self.color_anchors else 1.0), 3),
            "sampleCount": int(self.sample_count),
            "tentative": bool(not self.color_anchors and self.color_confidence < 0.45),
        }
        for team in (1, 2):
            color = self.team_colors.get(team)
            if color is None:
                color = self.color_anchors.get(team)
            hex_color = bgr_to_hex(color)
            if hex_color:
                colors[f"team{team}"] = hex_color
        return colors

    def _saturation_score(self, bgr: Any) -> float:
        blue, green, red = [float(value) / 255.0 for value in bgr[:3]]
        max_channel = max(red, green, blue)
        min_channel = min(red, green, blue)
        return 0.0 if max_channel <= 0 else (max_channel - min_channel) / max_channel

    def _brightness_score(self, bgr: Any) -> float:
        return max(0.0, min(1.0, sum(float(value) for value in bgr[:3]) / (255.0 * 3.0)))

    def _cv2_from_frame(self, frame: Any) -> Any | None:
        # Tests can use numpy-only fake frames; production passes real OpenCV arrays.
        try:
            import cv2
            return cv2
        except ModuleNotFoundError:
            return None


def color_distance(first: Any, second: Any) -> float:
    try:
        return sum((float(first[index]) - float(second[index])) ** 2 for index in range(3)) ** 0.5
    except (TypeError, ValueError, IndexError):
        return 0.0
