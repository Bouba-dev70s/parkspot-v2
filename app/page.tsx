"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import TabBar, { type TabId } from "./components/TabBar";
import PeekSheet from "./components/PeekSheet";
import DetailSheet from "./components/DetailSheet";
import { loadParkingsForCity, refreshSaemes, reverseGeocode, searchAddress, searchCity, type Parking, type CityInfo } from "@/lib/api";

const Map = dynamic(() => import("./components/Map"), { ssr: false });

type Step = "detecting" | "confirm" | "ready";

export default function Home() {
  const [step, setStep] = useState<Step>("detecting");
  const [city, setCity] = useState<CityInfo | null>(null);
  const [cityQuery, setCityQuery] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<CityInfo[]>([]);
  const [parkings, setParkings] = useState<Parking[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("map");
  const [selected, setSelected] = useState<Parking | null>(null);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [filter, setFilter] = useState("all");
  const [dataSource, setDataSource] = useState("loading");
  const [dark, setDark] = useState(false);
  const [addrQuery, setAddrQuery] = useState("");
  const [addrResults, setAddrResults] = useState<Array<{ label: string; lat: number; lng: number; city: string }>>([]);
  const [mapCenter, setMapCenter] = useState<[number, number] | undefined>(undefined);
  const [mapZoom, setMapZoom] = useState<number | undefined>(undefined);
  const addrTimer = useRef<NodeJS.Timeout>();

  // === INIT — detect city or load saved ===
  useEffect(() => {
    setFavorites(JSON.parse(localStorage.getItem("parkspot_favs") || "[]"));
    setDark(localStorage.getItem("parkspot_theme") === "dark");

    // Saved city? Skip detection
    const saved = localStorage.getItem("parkspot_city");
    if (saved) {
      try {
        const c = JSON.parse(saved) as CityInfo;
        setCity(c);
        setMapCenter([c.lat, c.lng]);
        setMapZoom(13);
        setStep("ready");
        doLoadCity(c);
        return;
      } catch {}
    }

    // GPS detection
    detectCity();
  }, []);

  async function detectCity() {
    setStep("detecting");
    if (!("geolocation" in navigator)) { setStep("confirm"); return; }

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
      });
      const p: [number, number] = [pos.coords.latitude, pos.coords.longitude];
      setUserPos(p);

      // Reverse geocode — try API adresse.data.gouv.fr
      const c = await reverseGeocode(p[0], p[1]);
      if (c) {
        setCity(c);
        setStep("confirm");
      } else {
        // Fallback: still got GPS, create a basic city info
        setCity({ name: "Votre position", department: "", lat: p[0], lng: p[1] });
        setStep("confirm");
      }
    } catch {
      // GPS refused or timed out
      setStep("confirm");
    }
  }

  // === DARK MODE ===
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("parkspot_theme", dark ? "dark" : "light");
  }, [dark]);

  // === LOAD CITY DATA ===
  async function doLoadCity(c: CityInfo) {
    localStorage.setItem("parkspot_city", JSON.stringify(c));
    const { data, source } = await loadParkingsForCity(c);
    setParkings(data);
    setDataSource(source);
  }

  function confirmCity(c: CityInfo) {
    setCity(c);
    setMapCenter([c.lat, c.lng]);
    setMapZoom(13);
    setStep("ready");
    doLoadCity(c);
  }

  function changeCity() {
    setStep("confirm");
    setCity(null);
    setCityQuery("");
    setCitySuggestions([]);
    localStorage.removeItem("parkspot_city");
  }

  // === CITY SEARCH ===
  useEffect(() => {
    if (cityQuery.length < 2) { setCitySuggestions([]); return; }
    const t = setTimeout(async () => setCitySuggestions(await searchCity(cityQuery)), 300);
    return () => clearTimeout(t);
  }, [cityQuery]);

  // === ADDRESS SEARCH ===
  function onAddrChange(q: string) {
    setAddrQuery(q);
    if (addrTimer.current) clearTimeout(addrTimer.current);
    if (q.length < 3) { setAddrResults([]); return; }
    addrTimer.current = setTimeout(async () => setAddrResults(await searchAddress(q)), 300);
  }

  function onAddrSelect(r: { lat: number; lng: number }) {
    setMapCenter([r.lat, r.lng]);
    setMapZoom(16);
    setAddrQuery("");
    setAddrResults([]);
  }

  // === SAEMES REFRESH ===
  useEffect(() => {
    if (dataSource !== "api" || !city) return;
    const isIDF = city.lat > 48.5 && city.lat < 49.1 && city.lng > 1.8 && city.lng < 3.2;
    if (!isIDF) return;
    const iv = setInterval(async () => setParkings(await refreshSaemes(parkings)), 120000);
    return () => clearInterval(iv);
  }, [dataSource, parkings, city]);

  // === FILTERING ===
  const filtered = useMemo(() => {
    return parkings.filter((p) => {
      if (filter === "free" && p.type !== "free") return false;
      if (filter === "paid" && p.type !== "paid") return false;
      if (filter === "available" && p.avail === 0) return false;
      return true;
    }).sort((a, b) => {
      if (a.avail === 0 && b.avail > 0) return 1;
      if (b.avail === 0 && a.avail > 0) return -1;
      if (userPos) {
        const da = Math.hypot((a.lat - userPos[0]) * 111, (a.lng - userPos[1]) * 74);
        const db = Math.hypot((b.lat - userPos[0]) * 111, (b.lng - userPos[1]) * 74);
        return da - db;
      }
      return (b.avail / b.total) - (a.avail / a.total);
    });
  }, [parkings, filter, userPos]);

  const freeCount = useMemo(() => filtered.filter((p) => p.type === "free").reduce((s, p) => s + p.avail, 0), [filtered]);
  const paidCount = useMemo(() => filtered.filter((p) => p.type === "paid").reduce((s, p) => s + p.avail, 0), [filtered]);

  function toggleFav(id: number) {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem("parkspot_favs", JSON.stringify(next));
      return next;
    });
  }

  function locate() {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setUserPos([pos.coords.latitude, pos.coords.longitude]);
        setMapCenter([pos.coords.latitude, pos.coords.longitude]);
        setMapZoom(15);
      }, () => {}, { enableHighAccuracy: true, timeout: 8000 });
    }
  }

  const onSelect = useCallback((p: Parking) => setSelected(p), []);
  const filters = ["all", "free", "paid", "available"] as const;
  const fLabels: Record<string, string> = { all: "Tous", free: "Gratuit", paid: "Payant", available: "Dispo" };

  // =====================================================
  // CITY DETECTION OVERLAY (on top of map)
  // =====================================================
  if (step !== "ready") {
    return (
      <div className="h-[100dvh] w-full bg-white dark:bg-[#0e0e12] text-gray-900 dark:text-white flex flex-col items-center justify-center px-6">

        {/* DETECTING — spinner */}
        {step === "detecting" && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center text-white text-4xl font-extrabold mb-6 mx-auto">
              <svg className="animate-spin w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10" opacity="0.3" /><path d="M12 2a10 10 0 019.95 9" strokeLinecap="round" /></svg>
            </div>
            <h1 className="text-2xl font-bold mb-2">Localisation en cours...</h1>
            <p className="text-gray-400">Detection automatique de votre ville</p>
          </div>
        )}

        {/* CONFIRM — city detected or manual search */}
        {step === "confirm" && (
          <div className="text-center w-full max-w-sm">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center text-white text-4xl font-extrabold mb-6 mx-auto">P</div>

            {city ? (
              <>
                <h1 className="text-xl font-bold mb-1 text-gray-500">Vous etes a</h1>
                <h2 className="text-4xl font-extrabold mb-1" style={{ color: "var(--accent)" }}>{city.name}</h2>
                {city.department && <p className="text-sm text-gray-400 mb-8">{city.department}</p>}
                {!city.department && <div className="mb-8" />}

                <button onClick={() => confirmCity(city)} className="w-full py-4 rounded-2xl bg-[var(--free)] text-black font-bold text-lg mb-3 active:scale-[0.97] transition-transform">
                  Oui, trouver des parkings
                </button>
                <button onClick={() => { setCity(null); setCityQuery(""); }} className="w-full py-3.5 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-semibold text-base active:scale-[0.97] transition-transform">
                  Non, changer de ville
                </button>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold mb-2">Ou etes-vous ?</h1>
                <p className="text-sm text-gray-400 mb-6">Tapez le nom de votre ville</p>
                <input
                  type="text" value={cityQuery}
                  onChange={(e) => setCityQuery(e.target.value)}
                  placeholder="Paris, Lyon, Valenciennes..."
                  className="w-full px-4 py-3.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-[15px] outline-none mb-3 text-gray-900 dark:text-white placeholder:text-gray-400"
                  autoFocus
                />
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {citySuggestions.map((c, i) => (
                    <button key={i} onClick={() => confirmCity(c)} className="w-full text-left p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl active:bg-gray-100 dark:active:bg-gray-700">
                      <div className="font-semibold text-gray-900 dark:text-white">{c.name}</div>
                      <div className="text-xs text-gray-400">{c.department}</div>
                    </button>
                  ))}
                </div>

                {/* Quick access popular cities */}
                {cityQuery.length === 0 && (
                  <div className="mt-6">
                    <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide font-semibold">Villes populaires</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {[
                        { name: "Paris", department: "75, Ile-de-France", lat: 48.8566, lng: 2.3522 },
                        { name: "Lyon", department: "69, Rhone", lat: 45.7578, lng: 4.8320 },
                        { name: "Marseille", department: "13, Bouches-du-Rhone", lat: 43.2965, lng: 5.3698 },
                        { name: "Lille", department: "59, Nord", lat: 50.6292, lng: 3.0573 },
                        { name: "Toulouse", department: "31, Haute-Garonne", lat: 43.6047, lng: 1.4442 },
                        { name: "Bordeaux", department: "33, Gironde", lat: 44.8378, lng: -0.5792 },
                        { name: "Nantes", department: "44, Loire-Atlantique", lat: 47.2184, lng: -1.5536 },
                        { name: "Strasbourg", department: "67, Bas-Rhin", lat: 48.5734, lng: 7.7521 },
                      ].map((c) => (
                        <button key={c.name} onClick={() => confirmCity(c)} className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300 active:bg-gray-100">
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Retry GPS button */}
                <button onClick={detectCity} className="mt-6 text-sm text-[var(--accent)] font-medium">
                  Reessayer la localisation GPS
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // =====================================================
  // MAIN APP — map + tabs
  // =====================================================
  return (
    <div className="h-[100dvh] w-full bg-white dark:bg-[#0e0e12] text-gray-900 dark:text-white">

      {activeTab === "map" && (
        <div className="absolute inset-0">
          <Map parkings={filtered} onSelect={onSelect} userPos={userPos} dark={dark} center={mapCenter} zoom={mapZoom} />

          {/* Search bar + city indicator */}
          <div className="absolute top-3 left-4 right-4 z-[1000] safe-top">
            <div className="relative mb-3">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 z-10">
                <button onClick={changeCity} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-semibold active:opacity-70">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  {city?.name || "Ville"}
                </button>
              </div>
              <input
                type="text" value={addrQuery}
                onChange={(e) => onAddrChange(e.target.value)}
                placeholder="Rechercher une adresse..."
                className="w-full pl-28 pr-4 py-3.5 bg-white dark:bg-[#1c1c24] border border-black/8 dark:border-white/8 rounded-2xl text-[15px] outline-none shadow-[0_4px_20px_rgba(0,0,0,0.12)] text-gray-900 dark:text-white placeholder:text-gray-400"
              />
              {addrResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1c1c24] border border-black/8 dark:border-white/8 rounded-2xl shadow-xl overflow-hidden z-50">
                  {addrResults.map((r, i) => (
                    <button key={i} onClick={() => onAddrSelect(r)} className="w-full text-left px-4 py-3 border-b border-black/5 dark:border-white/5 last:border-0 active:bg-gray-50 dark:active:bg-gray-800">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{r.label}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {filters.map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-full text-[13px] font-medium whitespace-nowrap border shadow-sm ${filter === f
                    ? f === "free" ? "bg-[var(--free-bg)] border-[var(--free)] text-[var(--free)]"
                    : f === "paid" ? "bg-[var(--paid-bg)] border-[var(--paid)] text-[var(--paid)]"
                    : "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-[var(--accent)]"
                    : "bg-white dark:bg-[#1c1c24] border-black/8 dark:border-white/8 text-gray-500 dark:text-gray-400"}`}>
                  {fLabels[f]}
                </button>
              ))}
            </div>
          </div>

          {/* Locate button */}
          <button onClick={locate} className="fixed bottom-[260px] right-4 z-[1000] w-12 h-12 rounded-full bg-white dark:bg-[#1c1c24] border border-black/8 dark:border-white/8 shadow-lg flex items-center justify-center text-[var(--accent)] active:scale-90">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /><circle cx="12" cy="12" r="8" /></svg>
          </button>

          {!selected && <PeekSheet parkings={filtered} onSelect={onSelect} freeCount={freeCount} paidCount={paidCount} />}
          {selected && <DetailSheet parking={selected} onClose={() => setSelected(null)} isFav={favorites.includes(selected.id)} onToggleFav={() => toggleFav(selected.id)} userPos={userPos} />}
        </div>
      )}

      {activeTab === "list" && (
        <div className="absolute inset-0 bg-white dark:bg-[#0e0e12] safe-top pt-4">
          <div className="px-5 pb-2">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-extrabold tracking-tight">Explorer</h1>
              <button onClick={changeCity} className="text-xs font-semibold text-[var(--accent)] px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                {city?.name || "Ville"}
              </button>
            </div>
            <input value={addrQuery} onChange={(e) => onAddrChange(e.target.value)} placeholder="Rechercher une adresse..." className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800/50 border border-black/8 dark:border-white/8 rounded-[14px] text-[15px] outline-none mb-3 text-gray-900 dark:text-white placeholder:text-gray-400" />
          </div>
          <div className="overflow-y-auto px-5 pb-24" style={{ height: "calc(100dvh - 180px)", WebkitOverflowScrolling: "touch" }}>
            {filtered.map((p) => {
              const r = p.total > 0 ? p.avail / p.total : 0;
              return (
                <button key={p.id} onClick={() => { setSelected(p); setActiveTab("map"); setMapCenter([p.lat, p.lng]); setMapZoom(16); }} className="w-full text-left p-4 bg-gray-50 dark:bg-gray-800/30 border border-black/5 dark:border-white/5 rounded-2xl mb-2.5 relative overflow-hidden active:bg-gray-100 dark:active:bg-gray-700">
                  <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-r ${p.type === "free" ? "bg-[var(--free)]" : "bg-[var(--paid)]"}`} />
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-[15px] font-semibold text-gray-900 dark:text-white">{p.name}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${p.type === "free" ? "bg-[var(--free-bg)] text-[var(--free)]" : "bg-[var(--paid-bg)] text-[var(--paid)]"}`}>{p.type === "free" ? "GRATUIT" : "PAYANT"}</span>
                  </div>
                  <div className="text-xs text-gray-400 mb-3">{p.addr} · {p.hours}</div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-black/5 dark:bg-white/5 rounded overflow-hidden"><div className={`h-full rounded ${r > 0.3 ? "bg-[var(--free)]" : r > 0 ? "bg-[var(--paid)]" : "bg-[var(--full)]"}`} style={{ width: `${r * 100}%` }} /></div>
                    <span className={`font-mono text-[13px] font-medium ${r > 0.3 ? "text-[var(--free)]" : r > 0 ? "text-[var(--paid)]" : "text-[var(--full)]"}`}>{p.avail}/{p.total}</span>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && <div className="text-center pt-16 text-gray-400">Aucun parking trouve pour {city?.name || "cette ville"}</div>}
          </div>
        </div>
      )}

      {activeTab === "fav" && (
        <div className="absolute inset-0 bg-white dark:bg-[#0e0e12] safe-top pt-4">
          <div className="px-5"><h1 className="text-3xl font-extrabold tracking-tight mb-4">Favoris</h1></div>
          <div className="overflow-y-auto px-5 pb-24" style={{ height: "calc(100dvh - 120px)" }}>
            {favorites.length === 0 ? (
              <div className="text-center pt-16 text-gray-400"><div className="text-5xl mb-3 opacity-30">&#9733;</div><div className="text-[15px] font-medium">Aucun parking sauvegarde</div></div>
            ) : favorites.map((id) => {
              const p = parkings.find((x) => x.id === id);
              if (!p) return null;
              return (
                <button key={id} onClick={() => { setSelected(p); setActiveTab("map"); setMapCenter([p.lat, p.lng]); setMapZoom(16); }} className="w-full text-left p-4 bg-gray-50 dark:bg-gray-800/30 border border-black/5 dark:border-white/5 rounded-2xl mb-2.5 active:bg-gray-100">
                  <div className="font-semibold text-gray-900 dark:text-white">{p.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{p.addr}</div>
                  <div className="font-mono text-sm mt-2" style={{ color: p.avail > 0 ? "var(--free)" : "var(--full)" }}>{p.avail} disponibles</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "alerts" && (
        <div className="absolute inset-0 bg-white dark:bg-[#0e0e12] safe-top pt-4">
          <div className="px-5"><h1 className="text-3xl font-extrabold tracking-tight mb-1">Alertes</h1><p className="text-sm text-gray-400 mb-5">Soyez notifie quand des places se liberent</p></div>
          <div className="px-5">
            <div className="p-4 bg-gray-100 dark:bg-gray-800/50 rounded-[14px] flex items-center justify-between">
              <div className="flex items-center gap-3"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg><div><div className="text-sm font-semibold text-gray-900 dark:text-white">Notifications push</div><div className="text-xs text-gray-400">Bientot disponible</div></div></div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "profile" && (
        <div className="absolute inset-0 bg-white dark:bg-[#0e0e12] safe-top pt-4">
          <div className="px-5"><h1 className="text-3xl font-extrabold tracking-tight mb-4">Profil</h1></div>
          <div className="overflow-y-auto px-5 pb-24" style={{ height: "calc(100dvh - 120px)" }}>
            <div className="w-18 h-18 rounded-full bg-gray-100 dark:bg-gray-800/50 flex items-center justify-center mx-auto mb-3"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg></div>
            <div className="text-xl font-bold text-center mb-0.5 text-gray-900 dark:text-white">Utilisateur ParkSpot</div>
            <div className="text-sm text-gray-400 text-center mb-5">{city?.name || "France"}{city?.department ? ` · ${city.department}` : ""}</div>
            <div className="grid grid-cols-3 gap-2 mb-6">
              <div className="bg-gray-100 dark:bg-gray-800/50 rounded-xl p-3.5 text-center"><div className="font-mono text-xl font-semibold text-gray-900 dark:text-white">{favorites.length}</div><div className="text-[10px] text-gray-400 mt-0.5 uppercase">Favoris</div></div>
              <div className="bg-gray-100 dark:bg-gray-800/50 rounded-xl p-3.5 text-center"><div className="font-mono text-xl font-semibold text-gray-900 dark:text-white">{parkings.length}</div><div className="text-[10px] text-gray-400 mt-0.5 uppercase">Parkings</div></div>
              <div className="bg-gray-100 dark:bg-gray-800/50 rounded-xl p-3.5 text-center"><div className="font-mono text-xl font-semibold text-gray-900 dark:text-white capitalize">{dataSource === "api" ? "Live" : dataSource}</div><div className="text-[10px] text-gray-400 mt-0.5 uppercase">Source</div></div>
            </div>
            <div className="text-xs font-semibold text-gray-400 tracking-[1px] uppercase mb-2.5 pl-1">Ville</div>
            <button onClick={changeCity} className="w-full p-4 bg-gray-100 dark:bg-gray-800/50 rounded-[14px] mb-2 flex items-center justify-between active:bg-gray-200 dark:active:bg-gray-700">
              <div className="flex items-center gap-3"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg><div><div className="text-sm font-semibold text-left text-gray-900 dark:text-white">{city?.name || "Choisir"}</div><div className="text-xs text-gray-400">{city?.department || "Appuyez pour changer"}</div></div></div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            <div className="text-xs font-semibold text-gray-400 tracking-[1px] uppercase mb-2.5 mt-5 pl-1">Preferences</div>
            <button onClick={() => setDark(!dark)} className="w-full p-4 bg-gray-100 dark:bg-gray-800/50 rounded-[14px] mb-2 flex items-center justify-between active:bg-gray-200 dark:active:bg-gray-700">
              <div className="flex items-center gap-3"><span className="text-lg">🌙</span><div><div className="text-sm font-semibold text-left text-gray-900 dark:text-white">Mode sombre</div><div className="text-xs text-gray-400">Interface sombre pour la nuit</div></div></div>
              <div className={`w-12 h-7 rounded-full relative ${dark ? "bg-[var(--free)]" : "bg-black/10"}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${dark ? "left-6" : "left-1"}`} /></div>
            </button>
            <div className="text-xs font-semibold text-gray-400 tracking-[1px] uppercase mb-2.5 mt-5 pl-1">A propos</div>
            <div className="p-4 bg-gray-100 dark:bg-gray-800/50 rounded-[14px]"><div className="text-sm font-semibold text-gray-900 dark:text-white">ParkSpot v2.0</div><div className="text-xs text-gray-400 mt-0.5">Next.js · BNLS France · Open Data Paris · Saemes</div></div>
          </div>
        </div>
      )}

      <TabBar active={activeTab} onChange={setActiveTab} />
    </div>
  );
}
