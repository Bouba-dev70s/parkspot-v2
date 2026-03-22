// === VOIRIE — Street parking for Paris ===

export interface VoirieStatus {
  zone: 1 | 2 | 0; // 0 = outside Paris
  isFree: boolean;
  reason: string; // "Dimanche", "Nuit (après 20h)", "Jour férié", "Payant"
  pricePerHour: number;
  maxDuration: number; // hours
  nextChange: string; // "Gratuit dans 2h", "Payant à 9h"
  arrondissement: number;
}

export interface StreetSpot {
  id: string;
  lat: number;
  lng: number;
  type: string; // "payant", "mixte", "livraison", "pmr", "2rm", "velo", etc.
  regime: string;
  places: number;
}

// === JOURS FÉRIÉS FRANCE 2025-2027 ===
const FERIES: string[] = [
  // 2025
  "2025-01-01", "2025-04-21", "2025-05-01", "2025-05-08", "2025-05-29",
  "2025-06-09", "2025-07-14", "2025-08-15", "2025-11-01", "2025-11-11", "2025-12-25",
  // 2026
  "2026-01-01", "2026-04-06", "2026-05-01", "2026-05-08", "2026-05-14",
  "2026-05-25", "2026-07-14", "2026-08-15", "2026-11-01", "2026-11-11", "2026-12-25",
  // 2027
  "2027-01-01", "2027-03-29", "2027-05-01", "2027-05-08", "2027-05-06",
  "2027-05-17", "2027-07-14", "2027-08-15", "2027-11-01", "2027-11-11", "2027-12-25",
];

function isJourFerie(d: Date): boolean {
  const str = d.toISOString().slice(0, 10);
  return FERIES.includes(str);
}

// === WHICH ARRONDISSEMENT? (approximate, based on coordinates) ===
function getArrondissement(lat: number, lng: number): number {
  // Rough mapping — center of each arrondissement
  const arrs: Array<{ num: number; lat: number; lng: number }> = [
    { num: 1, lat: 48.8606, lng: 2.3376 }, { num: 2, lat: 48.8683, lng: 2.3431 },
    { num: 3, lat: 48.8637, lng: 2.3615 }, { num: 4, lat: 48.8537, lng: 2.3565 },
    { num: 5, lat: 48.8462, lng: 2.3502 }, { num: 6, lat: 48.8499, lng: 2.3325 },
    { num: 7, lat: 48.8566, lng: 2.3150 }, { num: 8, lat: 48.8744, lng: 2.3106 },
    { num: 9, lat: 48.8769, lng: 2.3376 }, { num: 10, lat: 48.8758, lng: 2.3619 },
    { num: 11, lat: 48.8594, lng: 2.3795 }, { num: 12, lat: 48.8406, lng: 2.3876 },
    { num: 13, lat: 48.8322, lng: 2.3561 }, { num: 14, lat: 48.8312, lng: 2.3268 },
    { num: 15, lat: 48.8421, lng: 2.2988 }, { num: 16, lat: 48.8637, lng: 2.2769 },
    { num: 17, lat: 48.8867, lng: 2.3166 }, { num: 18, lat: 48.8925, lng: 2.3444 },
    { num: 19, lat: 48.8817, lng: 2.3825 }, { num: 20, lat: 48.8638, lng: 2.3985 },
  ];
  let min = Infinity, best = 0;
  for (const a of arrs) {
    const d = Math.sqrt(Math.pow(lat - a.lat, 2) + Math.pow(lng - a.lng, 2));
    if (d < min) { min = d; best = a.num; }
  }
  return best;
}

// === GET STREET PARKING STATUS ===
export function getStreetStatus(lat: number, lng: number, now?: Date): VoirieStatus {
  const d = now || new Date();
  const hour = d.getHours();
  const minute = d.getMinutes();
  const day = d.getDay(); // 0 = dimanche
  const ferie = isJourFerie(d);
  const arr = getArrondissement(lat, lng);

  // Outside Paris intra-muros?
  const inParis = lat > 48.815 && lat < 48.905 && lng > 2.225 && lng < 2.42;
  if (!inParis) return { zone: 0, isFree: true, reason: "Hors Paris", pricePerHour: 0, maxDuration: 0, nextChange: "", arrondissement: 0 };

  const zone: 1 | 2 = arr <= 11 ? 1 : 2;
  const prices = { 1: 6, 2: 4 }; // €/h visiteur standard
  const price = prices[zone];

  // Gratuit dimanche
  if (day === 0) {
    return { zone, isFree: true, reason: "Dimanche", pricePerHour: 0, maxDuration: 0, nextChange: "Payant lundi à 9h", arrondissement: arr };
  }

  // Gratuit jour férié
  if (ferie) {
    return { zone, isFree: true, reason: "Jour férié", pricePerHour: 0, maxDuration: 0, nextChange: "Payant demain à 9h", arrondissement: arr };
  }

  // Nuit: avant 9h ou après 20h
  if (hour < 9) {
    const minsUntil9 = (9 - hour) * 60 - minute;
    const h = Math.floor(minsUntil9 / 60);
    const m = minsUntil9 % 60;
    return { zone, isFree: true, reason: "Nuit (avant 9h)", pricePerHour: 0, maxDuration: 0, nextChange: `Payant dans ${h > 0 ? h + "h" : ""}${m > 0 ? m + "min" : ""}`, arrondissement: arr };
  }

  if (hour >= 20) {
    // Check if tomorrow is dimanche or férié
    const tmrw = new Date(d);
    tmrw.setDate(tmrw.getDate() + 1);
    const tmrwDay = tmrw.getDay();
    const tmrwFerie = isJourFerie(tmrw);
    if (tmrwDay === 0 || tmrwFerie) {
      return { zone, isFree: true, reason: "Nuit (après 20h)", pricePerHour: 0, maxDuration: 0, nextChange: "Gratuit demain aussi", arrondissement: arr };
    }
    return { zone, isFree: true, reason: "Nuit (après 20h)", pricePerHour: 0, maxDuration: 0, nextChange: "Payant demain à 9h", arrondissement: arr };
  }

  // Samedi — payant aussi 9h-20h
  // Heures payantes: 9h-20h, lundi-samedi
  const minsUntil20 = (20 - hour) * 60 - minute;
  const hLeft = Math.floor(minsUntil20 / 60);
  const mLeft = minsUntil20 % 60;
  return {
    zone, isFree: false,
    reason: `Zone ${zone} · Payant`,
    pricePerHour: price, maxDuration: 6,
    nextChange: `Gratuit dans ${hLeft > 0 ? hLeft + "h" : ""}${mLeft > 0 ? mLeft + "min" : ""}`,
    arrondissement: arr,
  };
}

// === COMPARISON VOIRIE vs PARKING ===
export function getVoirieComparison(parkingLat: number, parkingLng: number, parkingPricePerHour: number, parkingType: string, duration: number): {
  voiriePrice: number;
  parkingPrice: number;
  savings: number;
  cheaperOption: "voirie" | "parking" | "equal";
  voirieStatus: VoirieStatus;
  message: string;
} | null {
  const status = getStreetStatus(parkingLat, parkingLng);
  if (status.zone === 0) return null; // Not in Paris

  let voiriePrice = 0;
  if (!status.isFree) {
    // Progressive pricing Paris (approximate)
    if (duration <= 1) voiriePrice = status.pricePerHour;
    else if (duration <= 2) voiriePrice = status.pricePerHour * 1.9;
    else if (duration <= 3) voiriePrice = status.pricePerHour * 3;
    else if (duration <= 4) voiriePrice = status.pricePerHour * 4.2;
    else if (duration <= 5) voiriePrice = status.pricePerHour * 5.5;
    else voiriePrice = status.pricePerHour * 7; // max 6h
  }

  let parkingPrice = 0;
  if (parkingType !== "free") {
    if (duration <= 1) parkingPrice = parkingPricePerHour;
    else if (duration <= 2) parkingPrice = parkingPricePerHour * 1.8;
    else if (duration <= 4) parkingPrice = parkingPricePerHour * 3.2;
    else if (duration <= 8) parkingPrice = parkingPricePerHour * 5;
    else parkingPrice = parkingPricePerHour * 6;
  }

  const savings = Math.abs(voiriePrice - parkingPrice);
  const cheaperOption = voiriePrice < parkingPrice ? "voirie" : voiriePrice > parkingPrice ? "parking" : "equal";

  let message = "";
  if (status.isFree) {
    message = `Voirie gratuite (${status.reason}). ${parkingType === "free" ? "Le parking est aussi gratuit." : `Le parking coûte ${parkingPrice.toFixed(0)}€.`}`;
  } else if (cheaperOption === "parking") {
    message = `Tu économises ${savings.toFixed(0)}€ en parking souterrain vs la voirie.`;
  } else if (cheaperOption === "voirie") {
    message = `La voirie est ${savings.toFixed(0)}€ moins chère, mais limitée à ${status.maxDuration}h.`;
  } else {
    message = "Prix similaire. Le parking est plus sûr et sans limite de durée.";
  }

  return { voiriePrice, parkingPrice, savings, cheaperOption, voirieStatus: status, message };
}

// === FETCH STREET SPOTS from Paris Open Data ===
export async function fetchStreetSpots(lat: number, lng: number, radiusM: number = 500): Promise<StreetSpot[]> {
  try {
    const url = `https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/stationnement-voie-publique-emplacements/records?limit=100&where=within_distance(geo_point_2d,geom'POINT(${lng} ${lat})',${radiusM}m)`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const results: StreetSpot[] = [];
    for (const r of (data.results || [])) {
      const geo = r.geo_point_2d;
      if (!geo) continue;
      results.push({
        id: r.id_emprise || `s${results.length}`,
        lat: geo.lat || geo.latitude,
        lng: geo.lon || geo.longitude,
        type: (r.regpar || r.typsta || "inconnu").toLowerCase(),
        regime: r.regpar || "",
        places: parseInt(r.placal || r.placeg || r.plarel || "1"),
      });
    }
    return results;
  } catch {
    return [];
  }
}

// === PARIS ZONE BOUNDARIES (GeoJSON polygons for map overlay) ===
// Zone 1: arr 1-11 (rough boundary)
// Zone 2: arr 12-20 (outer ring)
// These are simplified polygons that cover the zones
export const PARIS_ZONE_1: [number, number][] = [
  [48.8440, 2.3200], [48.8440, 2.3800], [48.8550, 2.3900],
  [48.8650, 2.3880], [48.8780, 2.3800], [48.8800, 2.3600],
  [48.8800, 2.3300], [48.8750, 2.3100], [48.8650, 2.3050],
  [48.8550, 2.3080], [48.8440, 2.3200],
];

// Zone 2: entire Paris minus zone 1 (outer boundary)
export const PARIS_OUTER: [number, number][] = [
  [48.8150, 2.2250], [48.8150, 2.4200], [48.9050, 2.4200],
  [48.9050, 2.2250], [48.8150, 2.2250],
];

// === VOIRIE SPOT TYPE to display label ===
export function spotTypeLabel(type: string): { label: string; color: string } {
  const t = type.toLowerCase();
  if (t.includes("payant") || t.includes("rotatif")) return { label: "Payant", color: "#ea580c" };
  if (t.includes("mixte")) return { label: "Mixte", color: "#eab308" };
  if (t.includes("livraison")) return { label: "Livraison", color: "#dc2626" };
  if (t.includes("pmr") || t.includes("handicap")) return { label: "PMR", color: "#2563eb" };
  if (t.includes("2rm") || t.includes("moto")) return { label: "2 roues", color: "#8b5cf6" };
  if (t.includes("velo") || t.includes("vélo")) return { label: "Vélos", color: "#06b6d4" };
  if (t.includes("autocar")) return { label: "Autocars", color: "#64748b" };
  if (t.includes("electri")) return { label: "Électrique", color: "#16a34a" };
  if (t.includes("gratuit") || t.includes("libre")) return { label: "Gratuit", color: "#16a34a" };
  return { label: "Voirie", color: "#78716c" };
}
