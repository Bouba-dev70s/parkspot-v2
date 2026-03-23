// === NAVIGATION — Turn-by-turn with OSRM (free, no API key) ===

export interface RouteStep {
  instruction: string;
  distance: number; // meters
  duration: number; // seconds
  maneuver: string; // "turn-left", "turn-right", "straight", "arrive", etc.
  name: string; // street name
  icon: string; // emoji for direction
}

export interface Route {
  distance: number; // total meters
  duration: number; // total seconds
  geometry: [number, number][]; // [lat, lng] polyline
  steps: RouteStep[];
}

export interface NavigationState {
  route: Route;
  currentStepIndex: number;
  distanceToNext: number; // meters to next step
  distanceRemaining: number; // meters total remaining
  durationRemaining: number; // seconds remaining
  eta: string; // "14:23"
  isOffRoute: boolean;
  speed: number; // km/h
  heading: number; // degrees
}

// === MANEUVER → FRENCH INSTRUCTION ===
function maneuverToFrench(type: string, modifier: string, name: string): { text: string; icon: string } {
  const road = name ? ` sur ${name}` : "";
  const m = modifier || "";
  
  switch (type) {
    case "depart": return { text: `Démarrer${road}`, icon: "🏁" };
    case "arrive": return { text: "Vous êtes arrivé", icon: "📍" };
    case "turn":
      if (m.includes("left")) return { text: `Tourner à gauche${road}`, icon: "⬅️" };
      if (m.includes("right")) return { text: `Tourner à droite${road}`, icon: "➡️" };
      if (m.includes("sharp left")) return { text: `Tourner fortement à gauche${road}`, icon: "↙️" };
      if (m.includes("sharp right")) return { text: `Tourner fortement à droite${road}`, icon: "↗️" };
      if (m.includes("slight left")) return { text: `Légèrement à gauche${road}`, icon: "↖️" };
      if (m.includes("slight right")) return { text: `Légèrement à droite${road}`, icon: "↗️" };
      return { text: `Tourner${road}`, icon: "↪️" };
    case "new name": return { text: `Continuer${road}`, icon: "⬆️" };
    case "merge": return { text: `Rejoindre${road}`, icon: "🔀" };
    case "on ramp": return { text: `Prendre la bretelle${road}`, icon: "🛣️" };
    case "off ramp": return { text: `Sortir${road}`, icon: "↗️" };
    case "fork":
      if (m.includes("left")) return { text: `Rester à gauche${road}`, icon: "↙️" };
      if (m.includes("right")) return { text: `Rester à droite${road}`, icon: "↗️" };
      return { text: `Continuer${road}`, icon: "🔀" };
    case "end of road":
      if (m.includes("left")) return { text: `En bout de route, à gauche${road}`, icon: "⬅️" };
      if (m.includes("right")) return { text: `En bout de route, à droite${road}`, icon: "➡️" };
      return { text: `En bout de route${road}`, icon: "🔚" };
    case "continue": return { text: `Continuer tout droit${road}`, icon: "⬆️" };
    case "roundabout":
    case "rotary":
      return { text: `Au rond-point${road}`, icon: "🔄" };
    case "roundabout turn":
      if (m.includes("left")) return { text: `Au rond-point, à gauche${road}`, icon: "↩️" };
      return { text: `Au rond-point, à droite${road}`, icon: "↪️" };
    case "notification": return { text: name || "Continuer", icon: "ℹ️" };
    default: return { text: `Continuer${road}`, icon: "⬆️" };
  }
}

// === FORMAT DISTANCE ===
export function formatDistance(m: number): string {
  if (m < 100) return `${Math.round(m / 10) * 10} m`;
  if (m < 1000) return `${Math.round(m / 50) * 50} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// === FORMAT DURATION ===
export function formatDuration(s: number): string {
  const mins = Math.round(s / 60);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

// === FORMAT ETA ===
export function formatETA(durationSeconds: number): string {
  const arrival = new Date(Date.now() + durationSeconds * 1000);
  return arrival.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// === CALCULATE ROUTE VIA OSRM ===
export async function calculateRoute(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  mode: "driving" | "walking" = "driving"
): Promise<Route | null> {
  try {
    const profile = mode === "walking" ? "foot" : "car";
    const url = `https://router.project-osrm.org/route/v1/${profile}/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true&annotations=true`;
    
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    
    if (!data.routes || data.routes.length === 0) return null;
    const r = data.routes[0];
    
    // Parse geometry (GeoJSON → [lat, lng])
    const geometry: [number, number][] = r.geometry.coordinates.map(
      (c: [number, number]) => [c[1], c[0]] as [number, number]
    );
    
    // Parse steps
    const steps: RouteStep[] = [];
    for (const leg of r.legs) {
      for (const step of leg.steps) {
        const man = step.maneuver;
        const { text, icon } = maneuverToFrench(man.type, man.modifier || "", step.name || "");
        steps.push({
          instruction: text,
          distance: step.distance,
          duration: step.duration,
          maneuver: `${man.type}-${man.modifier || ""}`,
          name: step.name || "",
          icon,
        });
      }
    }
    
    return {
      distance: r.distance,
      duration: r.duration,
      geometry,
      steps,
    };
  } catch (e) {
    console.error("[Navigation] Route error:", e);
    return null;
  }
}

// === DISTANCE BETWEEN 2 POINTS (meters) ===
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// === FIND CLOSEST POINT ON ROUTE ===
export function closestPointOnRoute(lat: number, lng: number, geometry: [number, number][]): { index: number; distance: number } {
  let minDist = Infinity;
  let minIndex = 0;
  for (let i = 0; i < geometry.length; i++) {
    const d = distanceMeters(lat, lng, geometry[i][0], geometry[i][1]);
    if (d < minDist) { minDist = d; minIndex = i; }
  }
  return { index: minIndex, distance: minDist };
}

// === FIND CURRENT STEP based on position ===
export function findCurrentStep(lat: number, lng: number, route: Route): { stepIndex: number; distanceToNext: number; distanceRemaining: number; durationRemaining: number } {
  // Find where we are on the route
  const { index: geoIndex } = closestPointOnRoute(lat, lng, route.geometry);
  
  // Map geometry index to step
  let cumDist = 0;
  let stepIndex = 0;
  let stepDist = 0;
  
  for (let i = 0; i < route.steps.length; i++) {
    stepDist += route.steps[i].distance;
    const progress = (geoIndex / route.geometry.length) * route.distance;
    if (cumDist + route.steps[i].distance > progress) {
      stepIndex = i;
      break;
    }
    cumDist += route.steps[i].distance;
  }
  
  // Distance to next step
  const distToNext = Math.max(0, route.steps[stepIndex]?.distance || 0);
  
  // Remaining distance & duration
  let distRemaining = 0;
  let durRemaining = 0;
  for (let i = stepIndex; i < route.steps.length; i++) {
    distRemaining += route.steps[i].distance;
    durRemaining += route.steps[i].duration;
  }
  
  return { stepIndex, distanceToNext: distToNext, distanceRemaining: distRemaining, durationRemaining: durRemaining };
}

// === VOICE GUIDANCE ===
let lastSpoken = "";
let voiceEnabled = true;

export function setVoiceEnabled(enabled: boolean) { voiceEnabled = enabled; }
export function isVoiceEnabled(): boolean { return voiceEnabled; }

export function speak(text: string, force = false) {
  if (!voiceEnabled && !force) return;
  if (text === lastSpoken && !force) return;
  if (!("speechSynthesis" in window)) return;
  
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "fr-FR";
  utterance.rate = 1.05;
  utterance.pitch = 1;
  utterance.volume = 1;
  
  // Try to use a French voice
  const voices = window.speechSynthesis.getVoices();
  const fr = voices.find(v => v.lang.startsWith("fr")) || voices[0];
  if (fr) utterance.voice = fr;
  
  window.speechSynthesis.speak(utterance);
  lastSpoken = text;
}

// === SMART VOICE TRIGGERS ===
export function getVoiceInstruction(step: RouteStep, distanceToStep: number): string | null {
  // Announce at key distances
  if (distanceToStep <= 30 && distanceToStep > 10) {
    return step.instruction;
  }
  if (distanceToStep <= 150 && distanceToStep > 100) {
    return `Dans ${formatDistance(distanceToStep)}, ${step.instruction.toLowerCase()}`;
  }
  if (distanceToStep <= 500 && distanceToStep > 400 && step.distance > 500) {
    return `Dans 500 mètres, ${step.instruction.toLowerCase()}`;
  }
  return null;
}

// === OFF-ROUTE DETECTION ===
export const OFF_ROUTE_THRESHOLD = 50; // meters
