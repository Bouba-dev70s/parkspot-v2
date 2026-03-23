// === SMART PREDICTION ENGINE ===
// Multi-factor availability prediction with confidence levels
// Simulates ML-like predictions without a backend

export interface Prediction {
  avail: number;           // predicted available spots
  confidence: number;      // 0.0 to 1.0
  confidenceLabel: string; // "Élevée", "Moyenne", "Faible"
  trend: "up" | "down" | "stable"; // is it getting better or worse?
  trendLabel: string;      // "Se remplit", "Se vide", "Stable"
  bestTime: string | null; // "Venez à 20h, +45 places estimées"
  hourlyForecast: number[]; // 24 values, predicted availability per hour
}

// === OCCUPANCY PROFILES ===
// Different parking types have different patterns
type ProfileType = "center_commercial" | "gare" | "hopital" | "bureau" | "residentiel" | "touristique" | "general";

function detectProfile(name: string, addr: string): ProfileType {
  const n = (name + " " + addr).toLowerCase();
  if (n.includes("gare") || n.includes("sncf") || n.includes("station")) return "gare";
  if (n.includes("hop") || n.includes("clinic") || n.includes("médic")) return "hopital";
  if (n.includes("centre commercial") || n.includes("carrefour") || n.includes("leclerc") || n.includes("auchan") || n.includes("galeries") || n.includes("forum") || n.includes("bercy")) return "center_commercial";
  if (n.includes("tour") || n.includes("défense") || n.includes("office") || n.includes("business")) return "bureau";
  if (n.includes("louvre") || n.includes("eiffel") || n.includes("notre-dame") || n.includes("opéra") || n.includes("champs") || n.includes("montmartre") || n.includes("bastille")) return "touristique";
  if (n.includes("résiden") || n.includes("mairie") || n.includes("habitat")) return "residentiel";
  return "general";
}

// Occupancy curves per profile (0 = empty, 1 = full)
// Each array = 24 hours, weekday pattern
const WEEKDAY_PROFILES: Record<ProfileType, number[]> = {
  gare: [0.15, 0.10, 0.08, 0.08, 0.12, 0.25, 0.60, 0.85, 0.90, 0.80, 0.65, 0.60, 0.65, 0.60, 0.55, 0.60, 0.70, 0.85, 0.90, 0.75, 0.50, 0.35, 0.25, 0.18],
  hopital: [0.20, 0.15, 0.12, 0.12, 0.15, 0.20, 0.40, 0.70, 0.90, 0.95, 0.95, 0.90, 0.85, 0.90, 0.95, 0.85, 0.70, 0.50, 0.35, 0.25, 0.20, 0.18, 0.18, 0.18],
  center_commercial: [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.08, 0.10, 0.20, 0.50, 0.70, 0.80, 0.85, 0.80, 0.85, 0.90, 0.85, 0.75, 0.60, 0.40, 0.25, 0.15, 0.08, 0.05],
  bureau: [0.10, 0.08, 0.08, 0.08, 0.08, 0.10, 0.20, 0.55, 0.85, 0.95, 0.95, 0.90, 0.85, 0.90, 0.95, 0.90, 0.80, 0.55, 0.30, 0.20, 0.15, 0.12, 0.10, 0.10],
  touristique: [0.10, 0.08, 0.08, 0.08, 0.08, 0.10, 0.15, 0.25, 0.45, 0.65, 0.80, 0.90, 0.95, 0.90, 0.85, 0.80, 0.75, 0.65, 0.55, 0.40, 0.30, 0.20, 0.15, 0.12],
  residentiel: [0.90, 0.92, 0.93, 0.93, 0.90, 0.85, 0.70, 0.50, 0.35, 0.30, 0.30, 0.35, 0.40, 0.35, 0.30, 0.35, 0.45, 0.60, 0.75, 0.85, 0.88, 0.90, 0.91, 0.91],
  general: [0.15, 0.12, 0.10, 0.10, 0.12, 0.15, 0.25, 0.50, 0.70, 0.80, 0.75, 0.70, 0.75, 0.70, 0.65, 0.70, 0.75, 0.70, 0.55, 0.40, 0.30, 0.22, 0.18, 0.15],
};

// Weekend adjustments (multiplier on weekday)
const WEEKEND_MULT: Record<ProfileType, number> = {
  gare: 0.7,
  hopital: 0.6,
  center_commercial: 1.2,
  bureau: 0.2,
  touristique: 1.3,
  residentiel: 1.1,
  general: 0.8,
};

// === SEASONAL & MONTHLY FACTORS ===
function monthFactor(month: number): number {
  // 0=Jan, 11=Dec
  // Summer (Jul-Aug) lower for bureau, higher for touristique
  // December higher for center_commercial
  const factors = [0.95, 0.93, 0.97, 1.0, 1.02, 1.05, 0.85, 0.80, 1.05, 1.03, 1.0, 1.08];
  return factors[month] || 1.0;
}

// === WEATHER FACTOR (simulated) ===
function weatherFactor(hour: number): number {
  // Rainy days = more driving = more parking demand
  // We can't check real weather without API, but we add slight variance
  const seed = new Date().getDate(); // changes daily
  const rain = ((seed * 7 + hour * 13) % 10) > 7; // ~30% chance of "rain effect"
  return rain ? 1.08 : 1.0;
}

// === MAIN PREDICTION FUNCTION ===
export function predictAvailability(
  total: number,
  name: string,
  addr: string,
  realtime: boolean,
  realtimeAvail?: number,
  targetTime?: Date
): Prediction {
  const now = targetTime || new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const dayOfWeek = now.getDay(); // 0=Sun
  const month = now.getMonth();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const profile = detectProfile(name, addr);
  const basePattern = WEEKDAY_PROFILES[profile];

  // Build 24h forecast
  const hourlyForecast: number[] = [];
  for (let h = 0; h < 24; h++) {
    let occ = basePattern[h];

    // Weekend adjustment
    if (isWeekend) {
      occ *= WEEKEND_MULT[profile];
      // Sunday special: most things emptier
      if (dayOfWeek === 0) occ *= 0.85;
    }

    // Seasonal
    occ *= monthFactor(month);

    // Weather
    occ *= weatherFactor(h);

    // Parking size effect: smaller parkings are more volatile
    if (total < 50) occ += ((total * 3 + h * 7) % 20 - 10) / 100;
    if (total > 500) occ *= 0.95; // large parkings are rarely full

    // Clamp
    occ = Math.max(0.02, Math.min(0.98, occ));

    hourlyForecast.push(Math.max(1, Math.round(total * (1 - occ))));
  }

  // Current prediction (interpolate between hours)
  const currentHourAvail = hourlyForecast[hour];
  const nextHourAvail = hourlyForecast[(hour + 1) % 24];
  const interpolated = Math.round(currentHourAvail + (nextHourAvail - currentHourAvail) * (minute / 60));

  // If we have realtime data, use it as ground truth and adjust confidence
  let avail = realtime && realtimeAvail !== undefined ? realtimeAvail : interpolated;
  
  // Confidence
  let confidence: number;
  if (realtime) {
    confidence = 0.95; // realtime is very reliable
  } else {
    // Based on how "predictable" this profile is
    const volatility: Record<ProfileType, number> = {
      bureau: 0.85, residentiel: 0.82, hopital: 0.75, center_commercial: 0.70,
      gare: 0.65, touristique: 0.60, general: 0.55,
    };
    confidence = volatility[profile];
    // Lower confidence at peak transitions (8-9h, 17-19h)
    if ((hour >= 8 && hour <= 9) || (hour >= 17 && hour <= 19)) confidence *= 0.85;
    // Higher confidence at night
    if (hour < 6 || hour >= 22) confidence = Math.min(0.9, confidence * 1.15);
  }

  const confidenceLabel = confidence > 0.8 ? "Élevée" : confidence > 0.6 ? "Moyenne" : "Faible";

  // Trend: compare current to +1h
  const diff = nextHourAvail - currentHourAvail;
  let trend: "up" | "down" | "stable";
  let trendLabel: string;
  if (diff > total * 0.05) { trend = "up"; trendLabel = "Se vide"; }
  else if (diff < -total * 0.05) { trend = "down"; trendLabel = "Se remplit"; }
  else { trend = "stable"; trendLabel = "Stable"; }

  // Best time suggestion
  let bestTime: string | null = null;
  if (!realtime || (realtimeAvail !== undefined && realtimeAvail < total * 0.15)) {
    // Find the best hour in the next 12h
    let bestHour = -1;
    let bestAvail = 0;
    for (let i = 1; i <= 12; i++) {
      const h = (hour + i) % 24;
      if (hourlyForecast[h] > bestAvail) {
        bestAvail = hourlyForecast[h];
        bestHour = h;
      }
    }
    if (bestAvail > avail + total * 0.1) {
      bestTime = `${String(bestHour).padStart(2, "0")}h : ~${bestAvail} places estimées`;
    }
  }

  return {
    avail: Math.max(0, avail),
    confidence,
    confidenceLabel,
    trend,
    trendLabel,
    bestTime,
    hourlyForecast,
  };
}

// === PREDICTION FOR DISPLAY — compact text ===
export function predictionSummary(p: Prediction, total: number): string {
  const pct = total > 0 ? Math.round((p.avail / total) * 100) : 0;
  if (pct > 60) return "Très bonne disponibilité";
  if (pct > 30) return "Disponibilité correcte";
  if (pct > 10) return "Places limitées";
  if (pct > 0) return "Presque complet";
  return "Complet";
}

// === COLOR FOR CONFIDENCE ===
export function confidenceColor(confidence: number): string {
  if (confidence > 0.8) return "#16a34a";
  if (confidence > 0.6) return "#eab308";
  return "#ea580c";
}
