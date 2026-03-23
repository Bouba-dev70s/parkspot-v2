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
    fetch(url).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).catch((e) => { throw new Error(e.message || "Fetch failed"); }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout")), ms)),
  ]).catch((e) => { throw e; });
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

// === SMART AVAILABILITY ESTIMATE ===
// Uses the prediction engine for multi-factor estimation
function estimateAvail(total: number, name?: string, addr?: string): number {
  // Quick inline prediction (lighter than full predictAvailability)
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const n = ((name || "") + " " + (addr || "")).toLowerCase();

  // Detect parking type for better estimation
  let occupancy: number;
  const isGare = n.includes("gare") || n.includes("sncf");
  const isBureau = n.includes("tour") || n.includes("défense") || n.includes("office");
  const isCommerce = n.includes("commercial") || n.includes("galeries") || n.includes("forum");
  const isHopital = n.includes("hop") || n.includes("clinic");

  if (isWeekend) {
    if (isBureau) occupancy = 0.15;
    else if (isCommerce) occupancy = hour >= 10 && hour <= 19 ? 0.85 : 0.15;
    else if (isGare) occupancy = hour >= 8 && hour <= 20 ? 0.55 : 0.15;
    else if (isHopital) occupancy = hour >= 8 && hour <= 18 ? 0.60 : 0.20;
    else {
      if (hour >= 10 && hour <= 13) occupancy = 0.65;
      else if (hour >= 14 && hour <= 18) occupancy = 0.75;
      else if (hour >= 19 && hour <= 21) occupancy = 0.45;
      else occupancy = 0.15;
    }
    if (now.getDay() === 0) occupancy *= 0.85;
  } else {
    if (isBureau) {
      if (hour >= 9 && hour <= 17) occupancy = 0.92;
      else if (hour >= 7 && hour <= 9) occupancy = 0.70;
      else occupancy = 0.12;
    } else if (isGare) {
      if (hour >= 7 && hour <= 9 || hour >= 17 && hour <= 19) occupancy = 0.90;
      else if (hour >= 10 && hour <= 16) occupancy = 0.60;
      else occupancy = 0.20;
    } else if (isCommerce) {
      if (hour >= 10 && hour <= 12) occupancy = 0.65;
      else if (hour >= 14 && hour <= 18) occupancy = 0.85;
      else if (hour >= 12 && hour <= 14) occupancy = 0.80;
      else occupancy = 0.10;
    } else if (isHopital) {
      if (hour >= 9 && hour <= 16) occupancy = 0.90;
      else if (hour >= 7 && hour <= 9) occupancy = 0.65;
      else occupancy = 0.20;
    } else {
      if (hour >= 7 && hour <= 9) occupancy = 0.85;
      else if (hour >= 10 && hour <= 12) occupancy = 0.70;
      else if (hour >= 12 && hour <= 14) occupancy = 0.88;
      else if (hour >= 14 && hour <= 17) occupancy = 0.72;
      else if (hour >= 17 && hour <= 19) occupancy = 0.82;
      else if (hour >= 20 && hour <= 22) occupancy = 0.38;
      else occupancy = 0.12;
    }
  }

  // Interpolate between hours for smoother transitions
  const nextHourShift = (minute / 60) * 0.05 * (Math.random() > 0.5 ? 1 : -1);
  occupancy += nextHourShift;

  // Size variance
  const variance = ((total * 7) % 20) / 100 - 0.1;
  occupancy = Math.max(0.03, Math.min(0.97, occupancy + variance));

  return Math.max(1, Math.round(total * (1 - occupancy)));
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

    const cap = total || 100;
    results.push({
      id: nextId++, name: name.substring(0, 40), addr: addr.substring(0, 60), lat, lng,
      type: isFree ? "free" : "paid", total: cap,
      avail: estimateAvail(cap, name, addr),
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
      avail: estimateAvail(total || 200), // Smart estimate
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

// === LYON — LPA + Q-Park + Indigo via Grand Lyon ===
function parseLyon(features: any[]): Parking[] {
  const results: Parking[] = [];
  for (const f of features) {
    // Handle both WFS GeoJSON format and REST JSON format
    const props = f.properties || f;
    let lat = 0, lng = 0;
    if (f.geometry?.coordinates) { lng = f.geometry.coordinates[0]; lat = f.geometry.coordinates[1]; }
    else if (props.lat && props.lng) { lat = parseFloat(props.lat); lng = parseFloat(props.lng); }
    else if (props.latitude && props.longitude) { lat = parseFloat(props.latitude); lng = parseFloat(props.longitude); }
    else if (props.the_geom) {
      const m = String(props.the_geom).match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/);
      if (m) { lng = parseFloat(m[1]); lat = parseFloat(m[2]); }
    }
    if (!lat || !lng) continue;
    const name = props.parking_name || props.nom || props.name || "Parking Lyon";
    const total = parseInt(props.total_capacity || props.capacity || props.nb_places || props.capacite || "0");
    const avail = parseInt(props.available || props.free_places || props.dispo || props.libre || "0");
    const hasRt = props.available != null || props.free_places != null || props.dispo != null;
    results.push({
      id: nextId++, name: name.substring(0, 40), addr: "Lyon",
      lat, lng, type: "paid", total: total || 200, avail: hasRt ? Math.max(0, avail) : estimateAvail(total || 200),
      price: "3.00€/h", pricePerHour: 3.0, hours: "24/7",
      source: "lyon", city: "Lyon",
      services: { couvert: true, pmr: true, electrique: false, surveillance: true, velo: false, moto: false, autopartage: false, hauteurMax: null },
      realtime: hasRt, lastUpdate: props.updated_at || props.date_comptage || nowISO(),
    });
  }
  return results;
}

// === BORDEAUX — OpenDataSoft (temps réel, rafraîchi toutes les 2min30) ===
function parseBordeaux(records: any[]): Parking[] {
  const results: Parking[] = [];
  for (const f of records) {
    const geo = f.geo_point_2d || f.geom_o || f.geolocalisation;
    if (!geo) continue;
    const lat = geo.lat || geo.latitude;
    const lng = geo.lon || geo.longitude;
    if (!lat || !lng) continue;
    const name = f.nom || f.nom_parking || f.libelle || "Parking Bordeaux";
    const total = parseInt(f.np_total || f.total || f.nb_places || "0");
    const avail = parseInt(f.np_dispo || f.libres || f.places_disponibles || "0");
    const hasRt = f.np_dispo != null || f.libres != null;
    results.push({
      id: nextId++, name: name.substring(0, 40), addr: (f.adresse || f.voie || "Bordeaux").substring(0, 60),
      lat, lng, type: "paid", total: total || 200, avail: hasRt ? Math.max(0, avail) : estimateAvail(total || 200),
      price: "2.50€/h", pricePerHour: 2.5, hours: f.horaires || "24/7",
      source: "bordeaux", city: "Bordeaux",
      services: { couvert: (f.type_parking || "").toLowerCase().includes("couvert") || (f.type_parking || "").toLowerCase().includes("souterrain"), pmr: parseInt(f.np_pmr || f.nb_pmr || "0") > 0, electrique: parseInt(f.np_ve || f.nb_ve || "0") > 0, surveillance: true, velo: parseInt(f.np_velo || "0") > 0, moto: parseInt(f.np_2rm || "0") > 0, autopartage: false, hauteurMax: f.hauteur_max ? `${f.hauteur_max}m` : null },
      realtime: hasRt, lastUpdate: f.date_maj || nowISO(),
    });
  }
  return results;
}

// === MARSEILLE — Aix-Marseille Provence OpenDataSoft ===
function parseMarseille(records: any[]): Parking[] {
  const results: Parking[] = [];
  for (const f of records) {
    const geo = f.geo_point_2d || f.coordonnees;
    if (!geo) continue;
    const lat = geo.lat || geo.latitude;
    const lng = geo.lon || geo.longitude;
    if (!lat || !lng) continue;
    const name = f.nom || f.nom_parking || f.nom_du_parking || "Parking Marseille";
    const total = parseInt(f.capacite_totale || f.nb_places || f.capacite || "0");
    const occupe = parseInt(f.places_occupees || f.occupe || "0");
    const avail = parseInt(f.places_disponibles || f.dispo || "0");
    const hasRt = f.places_disponibles != null || f.dispo != null || f.places_occupees != null;
    const realAvail = hasRt ? (avail > 0 ? avail : Math.max(0, total - occupe)) : estimateAvail(total || 200);
    results.push({
      id: nextId++, name: name.substring(0, 40), addr: (f.adresse || "Marseille").substring(0, 60),
      lat, lng, type: "paid", total: total || 200, avail: realAvail,
      price: "2.80€/h", pricePerHour: 2.8, hours: f.horaires || "24/7",
      source: "marseille", city: "Marseille",
      services: { couvert: true, pmr: parseInt(f.nb_pmr || f.pmr || "0") > 0, electrique: parseInt(f.nb_ve || "0") > 0, surveillance: true, velo: false, moto: false, autopartage: false, hauteurMax: null },
      realtime: hasRt, lastUpdate: f.date_comptage || f.date_maj || nowISO(),
    });
  }
  return results;
}

// === LILLE — MEL OpenDataSoft (temps réel) ===
function parseLille(records: any[]): Parking[] {
  const results: Parking[] = [];
  for (const f of records) {
    const geo = f.geometry || f.geo_point_2d;
    if (!geo) continue;
    const lat = geo.lat || geo.latitude || (geo.coordinates ? geo.coordinates[1] : 0);
    const lng = geo.lon || geo.longitude || (geo.coordinates ? geo.coordinates[0] : 0);
    if (!lat || !lng) continue;
    const name = f.nom || f.libelle || f.nom_parking || "Parking Lille";
    const total = parseInt(f.max || f.nb_places || f.capacite || "0");
    const avail = parseInt(f.dispo || f.disponible || f.libre || "0");
    const etat = f.etat || f.statut || "";
    const hasRt = f.dispo != null || f.disponible != null || f.libre != null;
    results.push({
      id: nextId++, name: name.substring(0, 40), addr: (f.adresse || f.commune || "Lille").substring(0, 60),
      lat, lng, type: "paid", total: total || 200, avail: hasRt ? Math.max(0, avail) : estimateAvail(total || 200),
      price: "2.20€/h", pricePerHour: 2.2, hours: "24/7",
      source: "lille", city: f.commune || "Lille",
      services: { couvert: true, pmr: true, electrique: false, surveillance: true, velo: false, moto: false, autopartage: false, hauteurMax: null },
      realtime: hasRt && etat !== "FERME", lastUpdate: f.datemaj || nowISO(),
    });
  }
  return results;
}

// === SUPPORTED CITIES ===
export function isCitySupported(lat: number, lng: number): { supported: boolean; zone: string } {
  // IDF — wide bounds covering all departments 75, 77, 78, 91, 92, 93, 94, 95
  if (lat > 48.1 && lat < 49.3 && lng > 1.4 && lng < 3.6) return { supported: true, zone: "idf" };
  if (lat > 45.6 && lat < 45.9 && lng > 4.6 && lng < 5.1) return { supported: true, zone: "lyon" };
  if (lat > 44.7 && lat < 45.0 && lng > -0.8 && lng < -0.3) return { supported: true, zone: "bordeaux" };
  if (lat > 50.5 && lat < 50.8 && lng > 2.8 && lng < 3.3) return { supported: true, zone: "lille" };
  return { supported: false, zone: "none" };
}

// === LOAD PARKINGS FOR CITY ===
export async function loadParkingsForCity(city: CityInfo): Promise<{ data: Parking[]; source: string; timestamp: string }> {
  const results: Parking[] = [];
  let ok = false;
  const ck = `ps_${city.name.toLowerCase().replace(/\s/g, "_")}`;
  const ts = nowISO();
  const { supported, zone } = isCitySupported(city.lat, city.lng);

  if (!supported) {
    return { data: [], source: "unsupported", timestamp: ts };
  }

  const base = "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/mobilityref-france-base-nationale-des-lieux-de-stationnement/records?limit=100";

  // BNLS for supported cities only
  async function tryBnls() {
    const queries = [
      `${base}&where=within_distance(coordonneesxy,geom'POINT(${city.lng} ${city.lat})',30km)`,
      `${base}&where=within_distance(geo_point_2d,geom'POINT(${city.lng} ${city.lat})',30km)`,
      `${base}&geofilter.distance=${city.lat},${city.lng},30000`,
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
  }

  const fs = [tryBnls()];

  // === PARIS / IDF ===
  if (zone === "idf") {
    // Always get BNLS centered on Paris (covers most of IDF)
    fs.push(fetchT(`${base}&where=within_distance(coordonneesxy,geom'POINT(2.3522 48.8566)',40km)`)
      .then((d) => { const recs = d.results || []; if (recs.length > 0) { const p = parseBnls(recs, "Paris"); const newOnes = p.filter(np => !results.some(r => Math.abs(r.lat - np.lat) < 0.001 && Math.abs(r.lng - np.lng) < 0.001)); results.push(...newOnes); ok = true; console.log(`[API] BNLS Paris center: ${newOnes.length}`); } }).catch(() => {}));
    fs.push(
      fetchT("https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/stationnement-en-ouvrage/records?limit=100").then((d) => { const p = parseParisGarages(d.results || []); results.push(...p); ok = true; console.log(`[API] Paris garages: ${p.length}`); }).catch(() => {}),
      fetchT("https://opendata.saemes.fr/api/explore/v2.1/catalog/datasets/places-disponibles-parkings-saemes/records?limit=100").then((d) => { const p = parseSaemes(d.results || []); results.push(...p); ok = true; console.log(`[API] Saemes: ${p.length}`); }).catch(() => {}),
    );
  }

  // === LYON ===
  if (zone === "lyon") {
    fs.push(
      fetchT("https://data.grandlyon.com/fr/datapusher/ws/rdata/lpa_mobilite.parking/all.json?maxfeatures=100")
        .then((d) => { const features = (d.values || d.features || d) as any[]; if (Array.isArray(features)) { const p = parseLyon(features); results.push(...p); ok = true; console.log(`[API] Lyon: ${p.length}`); } })
        .catch(() => fetchT("https://download.data.grandlyon.com/ws/rdata/lpa_mobilite.parking/all.json?maxfeatures=100")
          .then((d) => { const features = (d.values || d.features || d) as any[]; if (Array.isArray(features)) { const p = parseLyon(features); results.push(...p); ok = true; } })
          .catch((e) => console.warn("[API] Lyon failed:", e.message))),
    );
  }

  // === BORDEAUX ===
  if (zone === "bordeaux") {
    fs.push(
      fetchT("https://opendata.bordeaux-metropole.fr/api/explore/v2.1/catalog/datasets/st_park_p/records?limit=100")
        .then((d) => { const p = parseBordeaux(d.results || []); results.push(...p); ok = true; console.log(`[API] Bordeaux: ${p.length}`); })
        .catch((e) => console.warn("[API] Bordeaux:", e.message)),
    );
  }

  // === LILLE ===
  if (zone === "lille") {
    fs.push(
      fetchT("https://opendata.lillemetropole.fr/api/explore/v2.1/catalog/datasets/disponibilite-parkings/records?limit=100")
        .then((d) => { const p = parseLille(d.results || []); results.push(...p); ok = true; console.log(`[API] Lille: ${p.length}`); })
        .catch((e) => console.warn("[API] Lille:", e.message)),
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
