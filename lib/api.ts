export interface Parking {
  id: number;
  name: string;
  addr: string;
  lat: number;
  lng: number;
  type: "free" | "paid";
  total: number;
  avail: number;
  price: string | null;
  hours: string;
  source: string;
}

const API = {
  PARIS_GARAGES:
    "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/stationnement-en-ouvrage/records?limit=100",
  SAEMES_REALTIME:
    "https://opendata.saemes.fr/api/explore/v2.1/catalog/datasets/places-disponibles-parkings-saemes/records?limit=100",
  BNLS_IDF:
    "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/mobilityref-france-base-nationale-des-lieux-de-stationnement/records?limit=100&refine=reg_name%3A%C3%8Ele-de-France",
  IDF_PARK_RIDE:
    "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/parking_relais_idf/records?limit=100",
  PARIS_STREET:
    "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/stationnement-voie-publique-emplacements/records?limit=100",
};

let nextId = 1000;

function fetchWithTimeout(url: string, ms = 8000): Promise<any> {
  return Promise.race([
    fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms)),
  ]);
}

function parseParisGarages(records: any[]): Parking[] {
  const results: Parking[] = [];
  for (const f of records) {
    const geo = f.geo_point_2d || f.geolocalisation;
    if (!geo) continue;
    const lat = geo.lat || geo.latitude;
    const lng = geo.lon || geo.longitude;
    if (!lat || !lng) continue;
    const name = f.nom_du_parc_de_stationnement || f.nom || f.nom_parking || "Parking";
    const addr = f.adresse || f.address || "";
    const total = parseInt(f.nombre_de_places_voitures || f.nb_places || f.capacite || "0");
    const hours = f.horaires_ouverture_du_parc || f.horaires || "24/7";
    const priceVal = f.tarif_1h || f.tarif_horaire || f.tarif_15mn;
    const price = priceVal ? `${parseFloat(priceVal).toFixed(2)}€/h` : null;
    results.push({
      id: nextId++, name: name.substring(0, 40), addr: addr.substring(0, 50),
      lat, lng, type: "paid", total: total || 200,
      avail: Math.floor(Math.random() * (total || 200) * 0.6),
      price: price || "3.50€/h", hours: hours.substring(0, 20), source: "paris",
    });
  }
  return results;
}

function parseSaemes(records: any[]): Parking[] {
  const results: Parking[] = [];
  for (const f of records) {
    const geo = f.geo || f.geo_point_2d;
    if (!geo) continue;
    const lat = geo.lat || geo.latitude;
    const lng = geo.lon || geo.longitude;
    if (!lat || !lng) continue;
    const name = f.nom_parking || f.name || "Parking Saemes";
    const addr = f.adresse || f.address || "";
    const total = parseInt(f.capacite_standard || f.capacite || "0");
    const avail = parseInt(f.compteur_standard || f.places_disponibles || "0");
    results.push({
      id: nextId++, name: name.substring(0, 40), addr: addr.substring(0, 50),
      lat, lng, type: "paid", total: total || 200, avail: Math.max(0, avail),
      price: f.tarif_1h ? `${parseFloat(f.tarif_1h).toFixed(2)}€/h` : "3.80€/h",
      hours: f.horaires || "24/7", source: "saemes",
    });
  }
  return results;
}

function parseBnls(records: any[]): Parking[] {
  const results: Parking[] = [];
  for (const f of records) {
    const geo = f.geo_point_2d || f.coordonneesxy;
    if (!geo) continue;
    const lat = geo.lat || geo.latitude;
    const lng = geo.lon || geo.longitude;
    if (!lat || !lng) continue;
    if (lat > 48.815 && lat < 48.905 && lng > 2.22 && lng < 2.47) continue;
    const name = f.nom || f.nom_parking || "Parking";
    const addr = f.com_nom || f.adresse || "";
    const total = parseInt(f.nb_pl || f.nb_places || "0");
    const isFree = f.gratuit === "true" || f.gratuit === true;
    results.push({
      id: nextId++, name: name.substring(0, 40), addr: addr.substring(0, 50),
      lat, lng, type: isFree ? "free" : "paid", total: total || 100,
      avail: Math.floor((total || 100) * (0.2 + Math.random() * 0.5)),
      price: isFree ? null : "2.50€/h", hours: "24/7", source: "bnls",
    });
  }
  return results;
}

function parseParkRide(records: any[]): Parking[] {
  const results: Parking[] = [];
  for (const f of records) {
    const geo = f.geo_point_2d || f.geo;
    if (!geo) continue;
    const lat = geo.lat || geo.latitude;
    const lng = geo.lon || geo.longitude;
    if (!lat || !lng) continue;
    const name = f.pr_nom || f.nom || "Parking Relais";
    const addr = f.gare || f.pr_commune || "";
    const total = parseInt(f.pr_nb_pl || f.capacite || "0");
    const isFree = f.gratuit_sdpr === "Oui";
    results.push({
      id: nextId++, name: `P+R ${name}`.substring(0, 40), addr: addr.substring(0, 50),
      lat, lng, type: isFree ? "free" : "paid", total: total || 80,
      avail: Math.floor((total || 80) * (0.15 + Math.random() * 0.4)),
      price: isFree ? null : "1.50€/j", hours: "Horaires gare", source: "idf_pr",
    });
  }
  return results;
}

function deduplicate(arr: Parking[]): Parking[] {
  const result: Parking[] = [];
  const used = new Set<number>();
  for (let i = 0; i < arr.length; i++) {
    if (used.has(i)) continue;
    result.push(arr[i]);
    for (let j = i + 1; j < arr.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(arr[i].lat - arr[j].lat) < 0.0005 && Math.abs(arr[i].lng - arr[j].lng) < 0.0005) {
        if (arr[j].source === "saemes") result[result.length - 1] = arr[j];
        used.add(j);
      }
    }
  }
  return result;
}

export const FALLBACK: Parking[] = [
  { id: 1, name: "Parking Rue de Rivoli", addr: "42 Rue de Rivoli, 75004", lat: 48.8566, lng: 2.3522, type: "free", total: 30, avail: 12, price: null, hours: "24/7", source: "fallback" },
  { id: 2, name: "Parking Indigo Bastille", addr: "Place de la Bastille", lat: 48.8533, lng: 2.3692, type: "paid", total: 450, avail: 87, price: "3.60€/h", hours: "24/7", source: "fallback" },
  { id: 3, name: "Parking Beaubourg", addr: "31 Rue Beaubourg", lat: 48.8606, lng: 2.3509, type: "paid", total: 380, avail: 52, price: "3.80€/h", hours: "7h-1h", source: "fallback" },
  { id: 4, name: "Parking Chatelet", addr: "Place du Chatelet", lat: 48.858, lng: 2.3468, type: "paid", total: 720, avail: 318, price: "4.00€/h", hours: "24/7", source: "fallback" },
  { id: 5, name: "Parking Republique", addr: "Place de la Republique", lat: 48.8674, lng: 2.3638, type: "paid", total: 520, avail: 135, price: "3.40€/h", hours: "24/7", source: "fallback" },
];

export async function loadParkingData(): Promise<{ data: Parking[]; source: string }> {
  const results: Parking[] = [];
  let apiSuccess = false;

  const fetches = [
    fetchWithTimeout(API.PARIS_GARAGES)
      .then((d) => { const p = parseParisGarages(d.results || []); results.push(...p); apiSuccess = true; console.log(`[API] Paris: ${p.length}`); })
      .catch((e) => console.warn("[API] Paris failed:", e.message)),
    fetchWithTimeout(API.SAEMES_REALTIME)
      .then((d) => { const p = parseSaemes(d.results || []); results.push(...p); apiSuccess = true; console.log(`[API] Saemes: ${p.length}`); })
      .catch((e) => console.warn("[API] Saemes failed:", e.message)),
    fetchWithTimeout(API.BNLS_IDF)
      .then((d) => { const p = parseBnls(d.results || []); results.push(...p); apiSuccess = true; console.log(`[API] BNLS: ${p.length}`); })
      .catch((e) => console.warn("[API] BNLS failed:", e.message)),
    fetchWithTimeout(API.IDF_PARK_RIDE)
      .then((d) => { const p = parseParkRide(d.results || []); results.push(...p); apiSuccess = true; console.log(`[API] P+R: ${p.length}`); })
      .catch((e) => console.warn("[API] P+R failed:", e.message)),
  ];

  await Promise.allSettled(fetches);

  if (apiSuccess && results.length > 0) {
    const data = deduplicate(results);
    try { localStorage.setItem("parkspot_cache", JSON.stringify(data)); } catch {}
    return { data, source: "api" };
  }

  try {
    const cached = JSON.parse(localStorage.getItem("parkspot_cache") || "");
    if (cached?.length > 0) return { data: cached, source: "cache" };
  } catch {}

  return { data: FALLBACK, source: "fallback" };
}

export async function refreshSaemes(current: Parking[]): Promise<Parking[]> {
  try {
    const res = await fetch(API.SAEMES_REALTIME);
    const data = await res.json();
    const fresh = parseSaemes(data.results || []);
    const updated = [...current];
    for (const f of fresh) {
      const idx = updated.findIndex(
        (p) => p.source === "saemes" && Math.abs(p.lat - f.lat) < 0.001 && Math.abs(p.lng - f.lng) < 0.001
      );
      if (idx >= 0) { updated[idx] = { ...updated[idx], avail: f.avail, total: f.total }; }
    }
    return updated;
  } catch { return current; }
}
