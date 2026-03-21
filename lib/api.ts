export interface ParkingServices {
  couvert: boolean;
  pmr: boolean;
  electrique: boolean;
  surveillance: boolean;
  velo: boolean;
  moto: boolean;
  autopartage: boolean;
  hauteurMax: string | null;
}

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
  pricePerHour: number;
  hours: string;
  source: string;
  city?: string;
  services: ParkingServices;
  realtime: boolean;
  lastUpdate: string;
}

export interface CityInfo {
  name: string;
  department: string;
  lat: number;
  lng: number;
}

let nextId = 1000;

function fetchT(url: string, ms = 10000): Promise<any> {
  return Promise.race([
    fetch(url).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout")), ms)),
  ]);
}

function defaultServices(): ParkingServices {
  return { couvert: false, pmr: false, electrique: false, surveillance: false, velo: false, moto: false, autopartage: false, hauteurMax: null };
}

function nowISO(): string { return new Date().toISOString(); }

// === REVERSE GEOCODE ===
export async function reverseGeocode(lat: number, lng: number): Promise<CityInfo | null> {
  try {
    const res = await fetchT(`https://api-adresse.data.gouv.fr/reverse/?lon=${lng}&lat=${lat}&limit=1`);
    const f = res.features?.[0]?.properties;
    if (!f) return null;
    return { name: f.city || f.label, department: f.context?.split(",")[0]?.trim() || "", lat, lng };
  } catch {
    try {
      const res = await fetchT(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=12`);
      return { name: res.address?.city || res.address?.town || res.address?.village || "Inconnu", department: res.address?.county || "", lat, lng };
    } catch { return null; }
  }
}

// === ADDRESS SEARCH ===
export async function searchAddress(query: string): Promise<Array<{ label: string; lat: number; lng: number; city: string }>> {
  if (query.length < 3) return [];
  try {
    const res = await fetchT(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
    return (res.features || []).map((f: any) => ({
      label: f.properties.label, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], city: f.properties.city || "",
    }));
  } catch { return []; }
}

// === CITY SEARCH ===
export async function searchCity(query: string): Promise<CityInfo[]> {
  if (query.length < 2) return [];
  try {
    const res = await fetchT(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&type=municipality&limit=6`);
    return (res.features || []).map((f: any) => ({
      name: f.properties.city || f.properties.label, department: f.properties.context?.split(",")[0]?.trim() || "",
      lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
    }));
  } catch { return []; }
}

// === PARSERS WITH REAL SERVICES ===

function parseBnls(records: any[], cityName?: string): Parking[] {
  const results: Parking[] = [];
  if (records.length > 0) {
    console.log(`[BNLS] Parsing ${records.length} records`);
  }
  for (const f of records) {
    // Geo: try multiple field names
    let lat = 0, lng = 0;
    if (f.ylat && f.xlong) { lat = parseFloat(f.ylat); lng = parseFloat(f.xlong); }
    else if (f.geo_point_2d) { lat = f.geo_point_2d.lat || f.geo_point_2d.latitude; lng = f.geo_point_2d.lon || f.geo_point_2d.longitude; }
    else if (f.coordonneesxy) { lat = f.coordonneesxy.lat || f.coordonneesxy.latitude; lng = f.coordonneesxy.lon || f.coordonneesxy.longitude; }
    if (!lat || !lng) continue;

    const name = f.name || f.nom || f.nom_parking || "Parking";
    const addr = f.address || (f.com_name ? `${f.com_name}` : "") || f.adresse || "";
    const total = parseInt(f.space_count || f.nb_pl || f.nb_places || f.capacite || "0");
    const isFree = f.is_free === "true" || f.is_free === true || f.gratuit === "true" || f.gratuit === true || f.user_type === "gratuit";

    // Pricing from real fields
    const cost1h = parseFloat(f.cost_1h || "0");
    const hp = cost1h > 0 ? cost1h : (isFree ? 0 : 2.5);

    // Services from REAL BNLS fields
    const elecCars = parseInt(f.electric_car_count || "0");
    const elec2w = parseInt(f.electric_2_wheels_count || "0");
    const svc: ParkingServices = {
      couvert: (f.facilities_type || "").toLowerCase().includes("souterrain") || (f.facilities_type || "").toLowerCase().includes("ouvrage") || (f.facilities_type || "").toLowerCase().includes("enclos"),
      pmr: parseInt(f.disable_count || f.nb_pl_pmr || "0") > 0,
      electrique: (elecCars + elec2w) > 0,
      surveillance: false,
      velo: parseInt(f.bike_count || f.nb_pl_velo || "0") > 0,
      moto: parseInt(f.motorize_2_wheels_count || f.nb_pl_2rm || "0") > 0,
      autopartage: parseInt(f.car_sharing_count || f.nb_pl_autopartage || "0") > 0,
      hauteurMax: f.max_height ? `${f.max_height}m` : null,
    };

    const city = f.com_name || f.com_nom || cityName || "";

    results.push({
      id: nextId++, name: name.substring(0, 40), addr: addr.substring(0, 60), lat, lng,
      type: isFree ? "free" : "paid", total: total || 100,
      avail: Math.floor((total || 100) * (0.15 + Math.random() * 0.5)),
      price: isFree ? null : `${hp.toFixed(2)}€/h`, pricePerHour: hp,
      hours: "24/7", source: "bnls", city,
      services: svc, realtime: false, lastUpdate: nowISO(),
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
    const total = parseInt(f.capacite_standard || f.capacite || "0");
    const avail = parseInt(f.compteur_standard || f.places_disponibles || "0");
    const hp = f.tarif_1h ? parseFloat(f.tarif_1h) : 3.8;
    const svc: ParkingServices = {
      couvert: true,
      pmr: parseInt(f.capacite_pmr || "0") > 0,
      electrique: parseInt(f.nb_voitures_electriques || f.nb_bornes_electriques || "0") > 0,
      surveillance: true,
      velo: parseInt(f.nb_velo || "0") > 0,
      moto: parseInt(f.nb_2roues || "0") > 0,
      autopartage: false,
      hauteurMax: f.hauteur_vehicule ? `${f.hauteur_vehicule}` : null,
    };
    results.push({
      id: nextId++, name: (f.nom_parking || "Saemes").substring(0, 40), addr: (f.adresse || "").substring(0, 60),
      lat, lng, type: "paid", total: total || 200, avail: Math.max(0, avail),
      price: `${hp.toFixed(2)}€/h`, pricePerHour: hp, hours: f.horaires || "24/7",
      source: "saemes", city: "Paris", services: svc,
      realtime: true, lastUpdate: f.date_comptage || nowISO(),
    });
  }
  return results;
}

function parseParisGarages(records: any[]): Parking[] {
  const results: Parking[] = [];
  for (const f of records) {
    const geo = f.geo_point_2d || f.geolocalisation;
    if (!geo) continue;
    const lat = geo.lat || geo.latitude;
    const lng = geo.lon || geo.longitude;
    if (!lat || !lng) continue;
    const total = parseInt(f.nombre_de_places_voitures || f.nb_places || "0");
    const hp = f.tarif_1h ? parseFloat(f.tarif_1h) : 3.5;
    const svc: ParkingServices = {
      couvert: (f.parc_en_ouvrage === "Oui" || f.type_de_parc === "Souterrain" || true),
      pmr: parseInt(f.nombre_de_places_pmr || "0") > 0,
      electrique: parseInt(f.nombre_de_places_avec_prise_electrique || "0") > 0 || (f.prise_electrique === "Oui"),
      surveillance: f.parc_en_ouvrage === "Oui",
      velo: parseInt(f.nombre_de_places_velos || "0") > 0,
      moto: parseInt(f.nombre_de_places_motos || "0") > 0,
      autopartage: parseInt(f.nombre_de_places_autopartage || "0") > 0,
      hauteurMax: f.hauteur_maximale_autorisee ? `${f.hauteur_maximale_autorisee}m` : null,
    };
    results.push({
      id: nextId++, name: (f.nom_du_parc_de_stationnement || f.nom || "Parking").substring(0, 40),
      addr: (f.adresse || "").substring(0, 60), lat, lng, type: "paid", total: total || 200,
      avail: Math.floor(Math.random() * (total || 200) * 0.6),
      price: `${hp.toFixed(2)}€/h`, pricePerHour: hp,
      hours: (f.horaires_ouverture_du_parc || "24/7").substring(0, 30), source: "paris", city: "Paris",
      services: svc, realtime: false, lastUpdate: nowISO(),
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
        if (arr[j].realtime) result[result.length - 1] = arr[j];
        used.add(j);
      }
    }
  }
  return result;
}

// === LOAD PARKINGS FOR CITY ===
export async function loadParkingsForCity(city: CityInfo): Promise<{ data: Parking[]; source: string; timestamp: string }> {
  const results: Parking[] = [];
  let ok = false;
  const ck = `ps_${city.name.toLowerCase().replace(/\s/g, "_")}`;
  const ts = nowISO();
  const base = "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/mobilityref-france-base-nationale-des-lieux-de-stationnement/records?limit=100";

  // Multiple BNLS query strategies
  async function tryBnls() {
    const queries = [
      `${base}&where=within_distance(coordonneesxy,geom'POINT(${city.lng} ${city.lat})',20km)`,
      `${base}&where=within_distance(geo_point_2d,geom'POINT(${city.lng} ${city.lat})',20km)`,
      `${base}&geofilter.distance=${city.lat},${city.lng},20000`,
      `${base}&refine=com_nom:${encodeURIComponent(city.name)}`,
    ];
    for (const url of queries) {
      try {
        const d = await fetchT(url);
        const recs = d.results || d.records?.map((r: any) => r.fields) || [];
        if (recs.length > 0) {
          const p = parseBnls(recs, city.name);
          results.push(...p); ok = true;
          console.log(`[API] BNLS ${city.name}: ${p.length} parkings`);
          return;
        }
      } catch {}
    }
    console.warn(`[API] BNLS: no data for ${city.name}`);
  }

  const fs = [tryBnls()];
  const isIDF = city.lat > 48.5 && city.lat < 49.1 && city.lng > 1.8 && city.lng < 3.2;
  if (isIDF) {
    fs.push(
      fetchT("https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/stationnement-en-ouvrage/records?limit=100").then((d) => { const p = parseParisGarages(d.results || []); results.push(...p); ok = true; }).catch(() => {}),
      fetchT("https://opendata.saemes.fr/api/explore/v2.1/catalog/datasets/places-disponibles-parkings-saemes/records?limit=100").then((d) => { const p = parseSaemes(d.results || []); results.push(...p); ok = true; }).catch(() => {}),
    );
  }
  await Promise.allSettled(fs);
  if (ok && results.length > 0) {
    const data = deduplicate(results);
    try { localStorage.setItem(ck, JSON.stringify({ data, ts })); } catch {}
    return { data, source: "api", timestamp: ts };
  }
  try { const c = JSON.parse(localStorage.getItem(ck) || ""); if (c?.data?.length) return { data: c.data, source: "cache", timestamp: c.ts || ts }; } catch {}
  return { data: [], source: "empty", timestamp: ts };
}

export async function refreshSaemes(current: Parking[]): Promise<Parking[]> {
  try {
    const d = await (await fetch("https://opendata.saemes.fr/api/explore/v2.1/catalog/datasets/places-disponibles-parkings-saemes/records?limit=100")).json();
    const fresh = parseSaemes(d.results || []);
    const u = [...current];
    for (const f of fresh) { const i = u.findIndex((p) => p.source === "saemes" && Math.abs(p.lat - f.lat) < 0.001); if (i >= 0) u[i] = { ...u[i], avail: f.avail, lastUpdate: f.lastUpdate, realtime: true }; }
    return u;
  } catch { return current; }
}

// === PRICE ESTIMATOR ===
export function estimatePrice(p: Parking, hours: number): string {
  if (p.type === "free") return "Gratuit";
  const r = p.pricePerHour || 3;
  if (hours <= 1) return `${r.toFixed(2)}€`;
  if (hours <= 2) return `${(r * 1.8).toFixed(2)}€`;
  if (hours <= 4) return `${(r * 3.2).toFixed(2)}€`;
  if (hours <= 8) return `${(r * 5).toFixed(2)}€`;
  if (hours <= 24) return `${(r * 6).toFixed(2)}€`;
  return `~${(r * 6 * Math.ceil(hours / 24)).toFixed(2)}€`;
}

// === DISTANCE HELPER ===
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return Math.sqrt(Math.pow((lat1 - lat2) * 111, 2) + Math.pow((lng1 - lng2) * 74, 2));
}

// === SORT BY PROXIMITY TO A POINT ===
export function sortByProximity(parkings: Parking[], lat: number, lng: number): Parking[] {
  return [...parkings].sort((a, b) => distanceKm(a.lat, a.lng, lat, lng) - distanceKm(b.lat, b.lng, lat, lng));
}
