export const demoStats = {
  possession: [
    { label: "DRIVXIS XI", value: 58 },
    { label: "Rival", value: 42 },
  ],
  matchMetrics: [
    { label: "Dist. equipo propio", value: "54.2 km", detail: "Agregado del equipo" },
    { label: "Dist. equipo rival", value: "51.9 km", detail: "Agregado del rival" },
    { label: "Presion alta", value: "74 eventos", detail: "22 recuperaciones" },
    { label: "Control territorial", value: "61%", detail: "Zona media-alta" },
  ],
  timeline: [
    { minute: "08'", event: "Presion alta recupera el balon", tone: "success" },
    { minute: "19'", event: "Carril izquierdo pierde compactacion", tone: "warning" },
    { minute: "36'", event: "Secuencia de 14 pases detectada", tone: "neutral" },
    { minute: "52'", event: "Ruptura por carril derecho detectada", tone: "success" },
    { minute: "77'", event: "Bloque bajo reduce espacio central", tone: "neutral" },
  ],
  players: [
    { x: 18, y: 28, team: "home" },
    { x: 31, y: 48, team: "home" },
    { x: 46, y: 34, team: "home" },
    { x: 62, y: 58, team: "home" },
    { x: 74, y: 42, team: "home" },
    { x: 22, y: 68, team: "away" },
    { x: 38, y: 22, team: "away" },
    { x: 54, y: 72, team: "away" },
    { x: 69, y: 25, team: "away" },
    { x: 83, y: 62, team: "away" },
  ],
};

export const futureAnalytics = [
  "Deteccion de jugadores, porteros, arbitros y balon",
  "Tracking multiobjeto orientado a lectura colectiva",
  "Posesión por equipo y por tramo del partido",
  "Distancia recorrida por equipo",
  "Mapa de calor por linea y zona",
  "Radar tactico con homografia del campo",
  "Control territorial y Voronoi por equipo",
  "Trayectoria del balon y eventos de recuperacion",
  "Clasificacion automatica por uniforme",
  "Alertas de presion, compactacion y rupturas",
];
