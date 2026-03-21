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

export async function searchAddress(query: string): Promise<Array<{ label: string; lat: number; lng: number; city: string }>> {
  if (query.length < 3) return [];
  try {
    const res = await fetchT(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
    return (res.features || []).map((f: any) => ({
      label: f.properties.label, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], city: f.properties.city || "",
    }));
  } catch { return []; }
}

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

function parseBnls(records: any[], cityName?: string): Parking[] {
  const results: Parking[] = [];
  for (const f of records) {
    const geo = f.geo_point_2d || f.coordonneesxy;
    if (!geo) continue;
    const lat = geo.lat || geo.latitude;
    const lng = geo.lon || geo.longitude;
    if (!lat || !lng) continue;
    const name = f.nom || f.nom_parking || "Parking";
    const addr = f.com_nom ? `${f.adr_num || ""} ${f.adr_voie || ""}, ${f.com_nom}`.trim() : (f.adresse || "");
    const total = parseInt(f.nb_pl || f.nb_places || f.capacite || "0");
    const isFree = f.gratuit === "true" || f.gratuit === true;
    const hp = f.th_heure ? parseFloat(f.th_heure) : (isFree ? 0 : 2.5);
    results.push({
      id: nextId++, name: name.substring(0, 40), addr: addr.substring(0, 50), lat, lng,
      type: isFree ? "free" : "paid", total: total || 100,
      avail: Math.floor((total || 100) * (0.15 + Math.random() * 0.5)),
      price: isFree ? null : `${hp.toFixed(2)}€/h`, pricePerHour: hp,
      hours: f.horaires_ouverture || "24/7", source: "bnls", city: f.com_nom || cityName || "",
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
    results.push({
      id: nextId++, name: (f.nom_parking || "Saemes").substring(0, 40), addr: (f.adresse || "").substring(0, 50),
      lat, lng, type: "paid", total: total || 200, avail: Math.max(0, avail),
      price: `${hp.toFixed(2)}€/h`, pricePerHour: hp, hours: f.horaires || "24/7", source: "saemes", city: "Paris",
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
    results.push({
      id: nextId++, name: (f.nom_du_parc_de_stationnement || f.nom || "Parking").substring(0, 40),
      addr: (f.adresse || "").substring(0, 50), lat, lng, type: "paid", total: total || 200,
      avail: Math.floor(Math.random() * (total || 200) * 0.6),
      price: `${hp.toFixed(2)}€/h`, pricePerHour: hp,
      hours: (f.horaires_ouverture_du_parc || "24/7").substring(0, 20), source: "paris", city: "Paris",
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

export async function loadParkingsForCity(city: CityInfo): Promise<{ data: Parking[]; source: string }> {
  const results: Parking[] = [];
  let ok = false;
  const ck = `ps_${city.name.toLowerCase().replace(/\s/g, "_")}`;
  const bnls = `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/mobilityref-france-base-nationale-des-lieux-de-stationnement/records?limit=100&geofilter.distance=${city.lat},${city.lng},20000`;
  const fs = [
    fetchT(bnls).then((d) => { const p = parseBnls(d.results || d.records?.map((r:any)=>r.fields) || [], city.name); results.push(...p); ok = true; console.log(`[API] BNLS ${city.name}: ${p.length}`); }).catch((e) => console.warn("[API] BNLS:", e.message)),
  ];
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
    try { localStorage.setItem(ck, JSON.stringify(data)); } catch {}
    return { data, source: "api" };
  }
  try { const c = JSON.parse(localStorage.getItem(ck) || ""); if (c?.length) return { data: c, source: "cache" }; } catch {}
  return { data: [], source: "empty" };
}

export async function refreshSaemes(current: Parking[]): Promise<Parking[]> {
  try {
    const d = await (await fetch("https://opendata.saemes.fr/api/explore/v2.1/catalog/datasets/places-disponibles-parkings-saemes/records?limit=100")).json();
    const fresh = parseSaemes(d.results || []);
    const u = [...current];
    for (const f of fresh) { const i = u.findIndex((p) => p.source === "saemes" && Math.abs(p.lat - f.lat) < 0.001); if (i >= 0) u[i] = { ...u[i], avail: f.avail }; }
    return u;
  } catch { return current; }
}

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
