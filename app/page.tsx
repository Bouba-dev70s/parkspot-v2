"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import TabBar, { type TabId } from "./components/TabBar";
import PeekSheet from "./components/PeekSheet";
import DetailSheet from "./components/DetailSheet";
import NavigationSheet from "./components/NavigationSheet";
import { loadParkingsForCity, refreshSaemes, reverseGeocode, searchAddress, searchCity, sortByProximity, distanceKm, isCitySupported, type Parking, type CityInfo } from "@/lib/api";
import { getStreetStatus, fetchStreetSpots, type StreetSpot, type VoirieStatus } from "@/lib/voirie";
import { calculateRoute, type Route } from "@/lib/navigation";

const Map = dynamic(() => import("./components/Map"), { ssr: false });
type Step = "splash" | "detecting" | "confirm" | "ready";
type SortMode = "smart" | "distance" | "price" | "avail";

interface Filters { maxDistance: number; maxPrice: number; parkingType: "all" | "covered" | "outdoor"; pmr: boolean; electrique: boolean; }
const defaultFilters: Filters = { maxDistance: 20, maxPrice: 0, parkingType: "all", pmr: false, electrique: false };

interface ParkedCar { parkingId: number; parkingName: string; lat: number; lng: number; time: string; }

export default function Home() {
  const [step, setStep] = useState<Step>("splash");
  const [city, setCity] = useState<CityInfo | null>(null);
  const [cityQuery, setCityQuery] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<CityInfo[]>([]);
  const [parkings, setParkings] = useState<Parking[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("map");
  const [selected, setSelected] = useState<Parking | null>(null);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [filter, setFilter] = useState("all");
  const [advFilters, setAdvFilters] = useState<Filters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [dataSource, setDataSource] = useState("loading");
  const [dataTimestamp, setDataTimestamp] = useState("");
  const [dark, setDark] = useState(false);
  const [addrQuery, setAddrQuery] = useState("");
  const [addrResults, setAddrResults] = useState<Array<{ label: string; lat: number; lng: number; city: string }>>([]);
  const [mapCenter, setMapCenter] = useState<[number, number] | undefined>(undefined);
  const [mapZoom, setMapZoom] = useState<number | undefined>(undefined);
  const [searchAnchor, setSearchAnchor] = useState<[number, number] | null>(null);
  const [addressPin, setAddressPin] = useState<[number, number] | null>(null);
  const [listVisible, setListVisible] = useState(20);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("smart");
  const [parkedCar, setParkedCar] = useState<ParkedCar | null>(null);
  const [showVoirie, setShowVoirie] = useState(false);
  const [streetSpots, setStreetSpots] = useState<StreetSpot[]>([]);
  const [voirieStatus, setVoirieStatus] = useState<VoirieStatus | null>(null);
  const [navRoute, setNavRoute] = useState<Route | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [navDest, setNavDest] = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [navMode, setNavMode] = useState<"driving" | "walking">("driving");
  const addrTimer = useRef<NodeJS.Timeout | null>(null);

  // === INIT ===
  useEffect(() => {
    setFavorites(JSON.parse(localStorage.getItem("parkspot_favs") || "[]"));
    setDark(localStorage.getItem("parkspot_theme") === "dark");
    try { const pc = JSON.parse(localStorage.getItem("parkspot_parked") || "null"); if (pc) setParkedCar(pc); } catch {}
    const t = setTimeout(() => {
      const saved = localStorage.getItem("parkspot_city");
      if (saved) { try { const c = JSON.parse(saved) as CityInfo; setCity(c); setMapCenter([c.lat, c.lng]); setMapZoom(13); setStep("ready"); doLoadCity(c); return; } catch {} }
      detectCity();
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  async function detectCity() {
    setStep("detecting");
    if (!("geolocation" in navigator)) { setStep("confirm"); return; }
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000 }));
      setUserPos([pos.coords.latitude, pos.coords.longitude]);
      const c = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      setCity(c || { name: "Votre position", department: "", lat: pos.coords.latitude, lng: pos.coords.longitude });
      setStep("confirm");
    } catch { setStep("confirm"); }
  }

  useEffect(() => { document.documentElement.classList.toggle("dark", dark); localStorage.setItem("parkspot_theme", dark ? "dark" : "light"); }, [dark]);

  async function doLoadCity(c: CityInfo) { setLoading(true); localStorage.setItem("parkspot_city", JSON.stringify(c)); const { data, source, timestamp } = await loadParkingsForCity(c); setParkings(data); setDataSource(source); setDataTimestamp(timestamp); setLoading(false); }
  function confirmCity(c: CityInfo) { setCity(c); setMapCenter([c.lat, c.lng]); setMapZoom(13); setStep("ready"); doLoadCity(c); }
  function changeCity() { setStep("confirm"); setCity(null); setCityQuery(""); setCitySuggestions([]); localStorage.removeItem("parkspot_city"); }

  useEffect(() => { if (cityQuery.length < 2) { setCitySuggestions([]); return; } const t = setTimeout(async () => setCitySuggestions(await searchCity(cityQuery)), 300); return () => clearTimeout(t); }, [cityQuery]);
  function onAddrChange(q: string) { setAddrQuery(q); if (addrTimer.current) clearTimeout(addrTimer.current); if (q.length < 3) { setAddrResults([]); return; } addrTimer.current = setTimeout(async () => setAddrResults(await searchAddress(q)), 300); }
  function onAddrSelect(r: { lat: number; lng: number; label: string }) { setMapCenter([r.lat, r.lng]); setMapZoom(16); setAddrQuery(""); setAddrResults([]); setSearchAnchor([r.lat, r.lng]); setAddressPin([r.lat, r.lng]); }

  useEffect(() => { if (dataSource !== "api" || !city) return; const isIDF = city.lat > 48.5 && city.lat < 49.1 && city.lng > 1.8 && city.lng < 3.2; if (!isIDF) return; const iv = setInterval(async () => { const u = await refreshSaemes(parkings); setParkings(u); setDataTimestamp(new Date().toISOString()); }, 120000); return () => clearInterval(iv); }, [dataSource, parkings, city]);

  // === PARK HERE ===
  function parkHere() {
    if (!selected) return;
    const pc: ParkedCar = { parkingId: selected.id, parkingName: selected.name, lat: selected.lat, lng: selected.lng, time: new Date().toISOString() };
    setParkedCar(pc);
    localStorage.setItem("parkspot_parked", JSON.stringify(pc));
    setSelected(null);
  }
  function clearParked() { setParkedCar(null); localStorage.removeItem("parkspot_parked"); }

  // === FILTERING + SORTING ===
  const anchorPoint = searchAnchor || (userPos ? userPos : city ? [city.lat, city.lng] as [number, number] : null);
  const filtered = useMemo(() => {
    let list = parkings.filter((p) => {
      if (filter === "free" && p.type !== "free") return false;
      if (filter === "paid" && p.type !== "paid") return false;
      if (filter === "available" && p.avail === 0) return false;
      if (advFilters.maxPrice > 0 && p.pricePerHour > advFilters.maxPrice) return false;
      if (advFilters.pmr && !p.services.pmr) return false;
      if (advFilters.electrique && !p.services.electrique) return false;
      if (advFilters.parkingType === "covered" && !p.services.couvert) return false;
      if (advFilters.parkingType === "outdoor" && p.services.couvert) return false;
      if (anchorPoint && advFilters.maxDistance < 20) { if (distanceKm(anchorPoint[0], anchorPoint[1], p.lat, p.lng) > advFilters.maxDistance) return false; }
      // Search by name
      if (searchQuery.length >= 2 && !p.name.toLowerCase().includes(searchQuery.toLowerCase()) && !p.addr.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
    // Sort
    if (sortMode === "distance" && anchorPoint) list = sortByProximity(list, anchorPoint[0], anchorPoint[1]);
    else if (sortMode === "price") list.sort((a, b) => a.pricePerHour - b.pricePerHour);
    else if (sortMode === "avail") list.sort((a, b) => b.avail - a.avail);
    else if (anchorPoint) list = sortByProximity(list, anchorPoint[0], anchorPoint[1]);
    else list.sort((a, b) => { if (a.realtime && !b.realtime) return -1; if (!a.realtime && b.realtime) return 1; return (b.avail / (b.total||1)) - (a.avail / (a.total||1)); });
    return list;
  }, [parkings, filter, advFilters, anchorPoint, searchQuery, sortMode]);

  const freeCount = useMemo(() => filtered.filter((p) => p.type === "free").length, [filtered]);
  const paidCount = useMemo(() => filtered.filter((p) => p.type === "paid").length, [filtered]);
  const activeFilterCount = useMemo(() => { let c = 0; if (advFilters.maxPrice > 0) c++; if (advFilters.pmr) c++; if (advFilters.electrique) c++; if (advFilters.parkingType !== "all") c++; if (advFilters.maxDistance < 20) c++; return c; }, [advFilters]);

  function toggleFav(id: number) { setFavorites((prev) => { const n = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]; localStorage.setItem("parkspot_favs", JSON.stringify(n)); return n; }); }
  function locate() { if ("geolocation" in navigator) navigator.geolocation.getCurrentPosition((pos) => { setUserPos([pos.coords.latitude, pos.coords.longitude]); setMapCenter([pos.coords.latitude, pos.coords.longitude]); setMapZoom(15); setSearchAnchor(null); setAddressPin(null); }, () => {}, { enableHighAccuracy: true, timeout: 8000 }); }
  const onSelect = useCallback((p: Parking) => setSelected(p), []);
  const fLabels: Record<string, string> = { all: "Tous", free: "Gratuit", paid: "Payant", available: "Dispo" };
  const sortLabels: Record<SortMode, string> = { smart: "Pertinence", distance: "Distance", price: "Prix", avail: "Dispo" };
  useEffect(() => { setListVisible(20); }, [activeTab, filter, advFilters, searchQuery, sortMode]);
  function onListScroll(e: React.UIEvent<HTMLDivElement>) { const el = e.currentTarget; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) setListVisible((v) => Math.min(v + 15, filtered.length)); }

  // Parked car time
  const parkedTimeText = useMemo(() => { if (!parkedCar) return ""; try { const diff = Math.floor((Date.now() - new Date(parkedCar.time).getTime()) / 60000); if (diff < 60) return `${diff} min`; return `${Math.floor(diff / 60)}h${diff % 60 > 0 ? String(diff % 60).padStart(2, "0") : ""}`; } catch { return ""; } }, [parkedCar]);

  // === VOIRIE — update status when city changes or every minute ===
  useEffect(() => {
    if (!city) return;
    const update = () => {
      const status = getStreetStatus(city.lat, city.lng);
      setVoirieStatus(status);
    };
    update();
    const iv = setInterval(update, 60000); // refresh every minute
    return () => clearInterval(iv);
  }, [city]);

  // === VOIRIE — fetch street spots when toggled ON in Paris ===
  useEffect(() => {
    if (!showVoirie || !city || !voirieStatus || voirieStatus.zone === 0) { setStreetSpots([]); return; }
    const pos = mapCenter || [city.lat, city.lng];
    fetchStreetSpots(pos[0], pos[1], 800).then(setStreetSpots);
  }, [showVoirie, city, mapCenter]);

  // === NAVIGATION ===
  async function startNavigation(parking: Parking, mode: "driving" | "walking" = "driving") {
    if (!userPos) {
      // Get current position first
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          const from: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setUserPos(from);
          const route = await calculateRoute(from[0], from[1], parking.lat, parking.lng, mode);
          if (route) {
            setNavRoute(route);
            setNavDest({ name: parking.name, lat: parking.lat, lng: parking.lng });
            setNavMode(mode);
            setNavigating(true);
            setSelected(null);
          }
        }, () => {}, { enableHighAccuracy: true, timeout: 8000 });
      }
      return;
    }
    const route = await calculateRoute(userPos[0], userPos[1], parking.lat, parking.lng, mode);
    if (route) {
      setNavRoute(route);
      setNavDest({ name: parking.name, lat: parking.lat, lng: parking.lng });
      setNavMode(mode);
      setNavigating(true);
      setSelected(null);
    }
  }

  function stopNavigation() {
    setNavigating(false);
    setNavRoute(null);
    setNavDest(null);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  // === GPS WATCH during navigation ===
  useEffect(() => {
    if (!navigating) return;
    if (!("geolocation" in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [navigating]);

  // === SPLASH ===
  if (step === "splash") return (<div className="splash bg-white dark:bg-[#0e0e12] text-gray-900 dark:text-white"><div className="splash-logo">P</div><div className="splash-text">ParkSpot</div><div className="splash-sub">Parking intelligent en France</div><div className="splash-spinner"><div className="splash-dots"><span /><span /><span /></div></div></div>);

  // === DETECTION ===
  if (step === "detecting" || step === "confirm") return (
    <div className="h-[100%] w-full bg-white dark:bg-[#0e0e12] text-gray-900 dark:text-white flex flex-col items-center justify-center px-6">
      {step === "detecting" && (<div className="text-center"><div className="splash-logo mx-auto mb-6" style={{ animation: "none" }}><svg className="animate-spin w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10" opacity="0.3" /><path d="M12 2a10 10 0 019.95 9" strokeLinecap="round" /></svg></div><h1 className="text-2xl font-bold mb-2">Localisation en cours...</h1><p className="text-gray-400">Détection automatique de votre ville</p></div>)}
      {step === "confirm" && (
        <div className="text-center w-full max-w-sm">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center text-white text-4xl font-extrabold mb-6 mx-auto shadow-lg shadow-green-500/30">P</div>
          {city ? (<><h1 className="text-xl font-bold mb-1 text-gray-500">Vous êtes à</h1><h2 className="text-4xl font-extrabold mb-1" style={{ color: "var(--accent)" }}>{city.name}</h2>{city.department && <p className="text-sm text-gray-400 mb-6">{city.department}</p>}{!city.department && <div className="mb-6" />}{isCitySupported(city.lat, city.lng).supported ? (<button onClick={() => confirmCity(city)} className="w-full py-4 rounded-2xl bg-[var(--free)] text-black font-bold text-lg mb-3 active:scale-[0.97] shadow-lg shadow-green-500/20">Oui, trouver des parkings</button>) : (<div className="w-full p-4 rounded-2xl bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 mb-4"><p className="text-sm text-orange-600 dark:text-orange-400 font-medium">Cette ville n'est pas encore couverte par ParkSpot. Choisissez une ville disponible ci-dessous.</p></div>)}<button onClick={() => { setCity(null); setCityQuery(""); }} className="w-full py-3.5 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-semibold active:scale-[0.97]">{isCitySupported(city.lat, city.lng).supported ? "Non, changer de ville" : "Choisir une ville disponible"}</button></>) : (<>
            <h1 className="text-2xl font-bold mb-2">Où êtes-vous ?</h1><p className="text-sm text-gray-400 mb-6">Tapez le nom de votre ville</p>
            <input type="text" value={cityQuery} onChange={(e) => setCityQuery(e.target.value)} placeholder="Paris, Lyon, Valenciennes..." className="w-full px-4 py-3.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-[15px] outline-none mb-3 text-gray-900 dark:text-white placeholder:text-gray-400" autoFocus />
            <div className="space-y-2 max-h-[280px] overflow-y-auto">{citySuggestions.map((c, i) => { const sup = isCitySupported(c.lat, c.lng).supported; return (<button key={i} onClick={() => confirmCity(c)} className="w-full text-left p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl active:bg-gray-100 dark:active:bg-gray-700"><div className="flex items-center gap-2"><span className="font-semibold text-gray-900 dark:text-white">{c.name}</span>{sup && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-100 dark:bg-green-900/30 text-green-600">DISPO</span>}</div><div className="text-xs text-gray-400">{c.department}{!sup ? " · Bientôt disponible" : ""}</div></button>); })}</div>
            {cityQuery.length === 0 && (<div className="mt-6"><p className="text-xs text-gray-400 mb-3 uppercase tracking-wide font-semibold">Villes disponibles</p><div className="flex flex-wrap gap-2 justify-center">{[{name:"Paris",department:"75",lat:48.8566,lng:2.3522},{name:"Lyon",department:"69",lat:45.7578,lng:4.832},{name:"Lille",department:"59",lat:50.6292,lng:3.0573},{name:"Bordeaux",department:"33",lat:44.8378,lng:-0.5792}].map((c)=>(<button key={c.name} onClick={()=>confirmCity(c)} className="px-4 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-full text-sm font-semibold text-green-700 dark:text-green-400 active:bg-green-100 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>{c.name}</button>))}</div><p className="text-[11px] text-gray-400 mt-4">D'autres villes arrivent bientôt</p></div>)}
            <button onClick={detectCity} className="mt-6 text-sm text-[var(--accent)] font-medium">Réessayer la localisation GPS</button>
          </>)}
        </div>
      )}
    </div>
  );

  // === MAIN APP ===
  return (
    <div className="h-[100%] w-full bg-white dark:bg-[#0e0e12] text-gray-900 dark:text-white">

      {/* FILTERS MODAL */}
      {showFilters && (<div className="fixed inset-0 z-[3000] bg-black/50 flex items-end" onClick={(e) => { if (e.target === e.currentTarget) setShowFilters(false); }}><div className="w-full max-w-lg mx-auto bg-white dark:bg-[#1c1c24] rounded-t-3xl p-6 safe-bottom"><div className="flex items-center justify-between mb-6"><h2 className="text-xl font-bold text-gray-900 dark:text-white">Filtres avancés</h2><button onClick={() => setShowFilters(false)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 text-lg">&times;</button></div><div className="mb-5"><div className="flex justify-between text-sm mb-2"><span className="text-gray-600 dark:text-gray-300">Distance max</span><span className="font-semibold text-gray-900 dark:text-white">{advFilters.maxDistance >= 20 ? "Illimitée" : `${advFilters.maxDistance} km`}</span></div><input type="range" min="1" max="20" value={advFilters.maxDistance} onChange={(e) => setAdvFilters({ ...advFilters, maxDistance: parseInt(e.target.value) })} className="w-full accent-[var(--accent)]" /></div><div className="mb-5"><div className="flex justify-between text-sm mb-2"><span className="text-gray-600 dark:text-gray-300">Prix max /heure</span><span className="font-semibold text-gray-900 dark:text-white">{advFilters.maxPrice === 0 ? "Tous" : `${advFilters.maxPrice.toFixed(1)}€`}</span></div><input type="range" min="0" max="8" step="0.5" value={advFilters.maxPrice} onChange={(e) => setAdvFilters({ ...advFilters, maxPrice: parseFloat(e.target.value) })} className="w-full accent-[var(--accent)]" /></div><div className="mb-5"><span className="text-sm text-gray-600 dark:text-gray-300 block mb-2">Type</span><div className="flex gap-2">{(["all","covered","outdoor"] as const).map((t)=>(<button key={t} onClick={()=>setAdvFilters({...advFilters,parkingType:t})} className={`flex-1 py-2.5 rounded-xl text-sm font-medium border ${advFilters.parkingType===t?"bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]":"bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500"}`}>{t==="all"?"Tous":t==="covered"?"Couvert":"Extérieur"}</button>))}</div></div><div className="mb-6"><span className="text-sm text-gray-600 dark:text-gray-300 block mb-2">Services</span><div className="flex gap-2"><button onClick={()=>setAdvFilters({...advFilters,pmr:!advFilters.pmr})} className={`px-4 py-2.5 rounded-xl text-sm font-medium border ${advFilters.pmr?"bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]":"bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500"}`}>♿ PMR ({parkings.filter(p=>p.services.pmr).length})</button><button onClick={()=>setAdvFilters({...advFilters,electrique:!advFilters.electrique})} className={`px-4 py-2.5 rounded-xl text-sm font-medium border ${advFilters.electrique?"bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]":"bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500"}`}>⚡ Électrique ({parkings.filter(p=>p.services.electrique).length})</button></div></div><div className="flex gap-3"><button onClick={()=>{setAdvFilters(defaultFilters);setShowFilters(false)}} className="flex-1 py-3.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-semibold">Réinitialiser</button><button onClick={()=>setShowFilters(false)} className="flex-1 py-3.5 rounded-xl bg-[var(--accent)] text-white font-semibold">{filtered.length} résultats</button></div></div></div>)}

      {/* PARKED CAR BANNER */}
      {parkedCar && activeTab === "map" && !selected && (
        <div className="fixed top-20 left-4 right-4 z-[1100] safe-top">
          <div className="bg-[var(--accent)] text-white px-4 py-3 rounded-2xl shadow-lg flex items-center gap-3">
            <span className="text-xl">🚗</span>
            <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">Garé à {parkedCar.parkingName}</div><div className="text-xs opacity-70">Il y a {parkedTimeText}</div></div>
            <button onClick={() => { setMapCenter([parkedCar.lat, parkedCar.lng]); setMapZoom(17); }} className="px-3 py-1.5 bg-white/20 rounded-lg text-xs font-semibold active:bg-white/30">Voir</button>
            <button onClick={clearParked} className="text-white/60 text-lg leading-none">✕</button>
          </div>
        </div>
      )}

      {/* UNSUPPORTED CITY SCREEN */}
      {dataSource === "unsupported" && activeTab === "map" && (
        <div className="absolute inset-0 z-[900] bg-white dark:bg-[#0e0e12] flex flex-col items-center justify-center px-8 text-center">
          <div className="w-20 h-20 rounded-3xl bg-gray-100 dark:bg-gray-800/50 flex items-center justify-center mb-6">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
          <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">{city?.name || "Cette ville"}</h2>
          <p className="text-gray-400 mb-8 leading-relaxed">Les données de stationnement ne sont pas encore disponibles pour cette ville. Nous travaillons à élargir notre couverture.</p>
          <p className="text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-4">Villes disponibles</p>
          <div className="flex flex-wrap gap-2 justify-center mb-8">
            {[{name:"Paris",lat:48.8566,lng:2.3522,dep:"75"},{name:"Lyon",lat:45.7578,lng:4.832,dep:"69"},{name:"Bordeaux",lat:44.8378,lng:-0.5792,dep:"33"},{name:"Lille",lat:50.6292,lng:3.0573,dep:"59"}].map((c)=>(
              <button key={c.name} onClick={()=>confirmCity({name:c.name,department:c.dep,lat:c.lat,lng:c.lng})} className="px-4 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-full text-sm font-semibold text-green-700 dark:text-green-400 active:bg-green-100 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>{c.name}</button>
            ))}
          </div>
          <button onClick={changeCity} className="text-[var(--accent)] font-semibold text-sm">Changer de ville</button>
        </div>
      )}

      {/* MAP TAB */}
      {activeTab === "map" && (
        <div className="absolute inset-0">
          {mapCenter ? <Map key={city?.name || "map"} parkings={navigating ? [] : filtered} onSelect={onSelect} userPos={userPos} dark={dark} center={mapCenter} zoom={mapZoom} selectedId={selected?.id} addressPin={navigating ? null : addressPin} showVoirie={showVoirie && !navigating} streetSpots={streetSpots} voirieStatus={voirieStatus} route={navRoute} navigating={navigating} /> : <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-900"><div className="splash-dots text-gray-400"><span/><span/><span/></div></div>}
          {loading && !navigating && (<div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1100] bg-white dark:bg-[#1c1c24] px-4 py-2 rounded-full shadow-lg border border-black/8 dark:border-white/8 flex items-center gap-2"><div className="splash-dots text-[var(--accent)]" style={{ transform: "scale(0.6)" }}><span/><span/><span/></div><span className="text-xs font-medium text-gray-500">Chargement...</span></div>)}
          {!navigating && <div className="absolute left-4 right-4 z-[1000]" style={{ top: "59px" }}>
            <button onClick={changeCity} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/90 dark:bg-[#1c1c24]/90 border border-black/8 dark:border-white/8 text-[var(--accent)] text-[11px] font-semibold active:opacity-70 mb-2 shadow-sm backdrop-blur-sm"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>{(city?.name || "Ville").substring(0, 20)} ▾</button>
            <div className="relative mb-2">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              <input type="text" value={addrQuery} onChange={(e)=>onAddrChange(e.target.value)} placeholder="Rechercher une adresse..." className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#1c1c24] border border-black/8 dark:border-white/8 rounded-xl text-[14px] outline-none shadow-sm text-gray-900 dark:text-white placeholder:text-gray-400" />
              {addrResults.length > 0 && (<div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1c1c24] border border-black/8 dark:border-white/8 rounded-xl shadow-xl overflow-hidden z-50">{addrResults.map((r,i)=>(<button key={i} onClick={()=>onAddrSelect(r)} className="w-full text-left px-4 py-3 border-b border-black/5 dark:border-white/5 last:border-0 active:bg-gray-50 dark:active:bg-gray-800"><div className="text-sm font-medium text-gray-900 dark:text-white">{r.label}</div></button>))}</div>)}
            </div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pr-4">{(["all","free","paid","available"] as const).filter((f) => { if (f === "free" && parkings.filter(p => p.type === "free").length === 0) return false; return true; }).map((f)=>(<button key={f} onClick={()=>setFilter(f)} className={`px-3.5 py-1.5 rounded-xl text-[12px] font-semibold whitespace-nowrap border ${filter===f?f==="free"?"bg-[var(--free)] border-[var(--free)] text-white":f==="paid"?"bg-[var(--paid)] border-[var(--paid)] text-white":"bg-[var(--accent)] border-[var(--accent)] text-white":"bg-white/90 dark:bg-[#1c1c24]/90 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 backdrop-blur-sm"}`}>{fLabels[f]}</button>))}<button onClick={()=>setShowFilters(true)} className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold whitespace-nowrap border flex items-center gap-1 shrink-0 ${activeFilterCount>0?"bg-[var(--accent)] border-[var(--accent)] text-white":"bg-white/90 dark:bg-[#1c1c24]/90 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 backdrop-blur-sm"}`}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 21V14m0 0V3m0 11h6m14 7V10m0 0V3m0 7h-6M14 21V10m0 0V3m0 7h-6"/></svg>Filtres{activeFilterCount>0?` (${activeFilterCount})`:""}</button></div>
            {searchAnchor && (<div className="mt-2 flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-full w-fit"><span className="text-xs text-[var(--accent)]">Tri par proximité</span><button onClick={()=>{setSearchAnchor(null);setAddressPin(null)}} className="text-[var(--accent)] font-bold text-xs">✕</button></div>)}
          </div>}
          {!navigating && <button onClick={locate} className="fixed bottom-[260px] right-4 z-[1000] w-12 h-12 rounded-full bg-white dark:bg-[#1c1c24] border border-black/8 dark:border-white/8 shadow-lg flex items-center justify-center text-[var(--accent)] active:scale-90"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/><circle cx="12" cy="12" r="8"/></svg></button>}
          {/* Voirie toggle — only in Paris */}
          {!navigating && voirieStatus && voirieStatus.zone > 0 && (
            <button onClick={() => setShowVoirie(!showVoirie)} className={`fixed bottom-[320px] right-4 z-[1000] w-12 h-12 rounded-full border shadow-lg flex items-center justify-center active:scale-90 ${showVoirie ? "bg-[var(--accent)] border-[var(--accent)] text-white" : "bg-white dark:bg-[#1c1c24] border-black/8 dark:border-white/8 text-gray-500 dark:text-gray-400"}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7h18M3 12h18M3 17h18"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/><circle cx="11" cy="17" r="1.5" fill="currentColor"/></svg>
            </button>
          )}
          {/* Voirie status badge */}
          {!navigating && showVoirie && voirieStatus && voirieStatus.zone > 0 && (
            <div className="fixed bottom-[380px] right-3 z-[1000] bg-white dark:bg-[#1c1c24] border border-black/8 dark:border-white/8 rounded-xl shadow-lg px-3 py-2 max-w-[160px]">
              <div className={`text-[11px] font-bold ${voirieStatus.isFree ? "text-[var(--free)]" : "text-[var(--paid)]"}`}>{voirieStatus.isFree ? "🅿️ Voirie gratuite" : `🅿️ Voirie ${voirieStatus.pricePerHour}€/h`}</div>
              <div className="text-[9px] text-gray-400 mt-0.5">{voirieStatus.reason}</div>
              {voirieStatus.nextChange && <div className="text-[9px] text-gray-400">⏱ {voirieStatus.nextChange}</div>}
            </div>
          )}
          {!selected && !navigating && <PeekSheet parkings={filtered} onSelect={onSelect} freeCount={freeCount} paidCount={paidCount} timestamp={dataTimestamp} />}
          {selected && !navigating && <DetailSheet parking={selected} onClose={()=>setSelected(null)} isFav={favorites.includes(selected.id)} onToggleFav={()=>toggleFav(selected.id)} userPos={userPos} onParkHere={parkHere} onNavigate={(mode) => startNavigation(selected, mode)} />}
          {navigating && navRoute && navDest && (
            <NavigationSheet
              route={navRoute}
              userPos={userPos}
              destination={navDest}
              onClose={stopNavigation}
              onUpdateRoute={(r) => setNavRoute(r)}
              onCenterUser={() => { if (userPos) { setMapCenter([...userPos]); setMapZoom(17); } }}
              mode={navMode}
            />
          )}
        </div>
      )}

      {/* EXPLORER TAB */}
      {activeTab === "list" && (
        <div className="absolute inset-0 bg-white dark:bg-[#0e0e12] safe-top pt-4">
          <div className="px-5 pb-2">
            <div className="flex items-center justify-between mb-3"><h1 className="text-3xl font-extrabold tracking-tight">Explorer</h1><button onClick={changeCity} className="text-xs font-semibold text-[var(--accent)] px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>{city?.name}</button></div>
            {/* Search by name */}
            <div className="relative mb-3">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Rechercher un parking..." className="w-full pl-10 pr-4 py-2.5 bg-gray-100 dark:bg-gray-800/50 border border-black/5 dark:border-white/5 rounded-xl text-[14px] outline-none text-gray-900 dark:text-white placeholder:text-gray-400" />
            </div>
            {/* Sort */}
            <div className="flex gap-1.5 mb-1">
              {(["smart","distance","price","avail"] as const).map((s) => (
                <button key={s} onClick={() => setSortMode(s)} className={`flex-1 py-2 rounded-xl text-[11px] font-semibold tracking-wide border ${sortMode === s ? "bg-[var(--accent)] border-[var(--accent)] text-white" : "bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"}`}>
                  {sortLabels[s]}
                </button>
              ))}
            </div>
          </div>
          {loading ? (<div className="px-5 space-y-3">{[1,2,3,4,5].map((i)=>(<div key={i} className="skeleton h-24 w-full" />))}</div>) : (
          <div onScroll={onListScroll} className="overflow-y-auto px-5 pb-24" style={{ height: "calc(100% - 190px)", WebkitOverflowScrolling: "touch" }}>
            {filtered.slice(0, listVisible).map((p, idx) => { const r = p.total > 0 ? p.avail / p.total : 0; const d = anchorPoint ? distanceKm(anchorPoint[0], anchorPoint[1], p.lat, p.lng) : null; const est = !p.realtime; return (
              <button key={p.id} onClick={() => { setSelected(p); setActiveTab("map"); setMapCenter([p.lat, p.lng]); setMapZoom(16); }} className="card-appear w-full text-left p-4 bg-white dark:bg-gray-800/20 border border-gray-100 dark:border-white/5 rounded-2xl mb-2 relative overflow-hidden active:bg-gray-50 dark:active:bg-gray-700/50" style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}>
                <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-r ${p.type === "free" ? "bg-[var(--free)]" : "bg-[var(--paid)]"}`} />
                <div className="flex justify-between items-start mb-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[14px] font-semibold text-gray-900 dark:text-white truncate">{p.name}</span>
                    {p.realtime && <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ml-2 tracking-wide ${p.type === "free" ? "bg-[var(--free-bg)] text-[var(--free)]" : "bg-[var(--paid-bg)] text-[var(--paid)]"}`}>{p.type === "free" ? "GRATUIT" : p.price}</span>
                </div>
                <div className="text-[12px] text-gray-400 mb-2">{p.addr}{d !== null ? ` · ${d < 1 ? `${Math.round(d*1000)}m` : `${d.toFixed(1)}km`}` : ""}</div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  {p.services.couvert && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700/50 rounded-md text-gray-500 dark:text-gray-400 font-medium">Couvert</span>}
                  {p.services.pmr && <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 rounded-md text-blue-500 font-medium">PMR</span>}
                  {p.services.electrique && <span className="text-[10px] px-1.5 py-0.5 bg-green-50 dark:bg-green-900/20 rounded-md text-green-600 font-medium">Élec.</span>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden"><div className={`h-full rounded-full ${r > 0.3 ? "bg-[var(--free)]" : r > 0 ? "bg-[var(--paid)]" : "bg-[var(--full)]"}`} style={{ width: `${r*100}%` }} /></div>
                  <span className={`text-[12px] font-semibold tabular-nums ${r > 0.3 ? "text-[var(--free)]" : r > 0 ? "text-[var(--paid)]" : "text-[var(--full)]"}`}>{est ? "~" : ""}{p.avail}<span className="text-gray-300 dark:text-gray-600 font-normal">/{p.total}</span></span>
                </div>
              </button>); })}
            {listVisible < filtered.length && <div className="text-center py-4 text-xs text-gray-400">Scroll pour voir plus ({filtered.length - listVisible} restants)</div>}
            {filtered.length === 0 && !loading && (<div className="text-center pt-16 px-4"><div className="text-5xl mb-3 opacity-20">🔍</div><div className="text-[15px] font-medium text-gray-600 dark:text-gray-300 mb-2">Aucun parking trouvé</div><button onClick={() => { setAdvFilters(defaultFilters); setSearchQuery(""); }} className="text-[var(--accent)] font-semibold text-sm">Réinitialiser</button></div>)}
          </div>)}
        </div>
      )}

      {/* FAV TAB */}
      {activeTab === "fav" && (
        <div className="absolute inset-0 bg-white dark:bg-[#0e0e12] safe-top pt-4">
          <div className="px-5"><h1 className="text-3xl font-extrabold tracking-tight mb-4">Favoris</h1></div>
          <div className="overflow-y-auto px-5 pb-24" style={{ height: "calc(100% - 120px)" }}>
            {favorites.length === 0 ? (<div className="text-center pt-16 text-gray-400"><div className="text-5xl mb-3 opacity-30">&#9733;</div><div className="text-[15px] font-medium">Aucun parking sauvegardé</div></div>)
            : favorites.map((id) => { const p = parkings.find((x) => x.id === id); if (!p) return null; return (
              <button key={id} onClick={() => { setSelected(p); setActiveTab("map"); setMapCenter([p.lat, p.lng]); setMapZoom(16); }} className="card-appear w-full text-left p-4 bg-gray-50 dark:bg-gray-800/30 border border-black/5 dark:border-white/5 rounded-2xl mb-2.5 active:bg-gray-100"><div className="font-semibold text-gray-900 dark:text-white">{p.name}</div><div className="text-xs text-gray-400 mt-0.5">{p.addr}</div><div className="text-sm mt-2" style={{ color: p.avail > 0 ? "var(--free)" : "var(--full)" }}>{p.realtime ? "" : "~"}{p.avail} disponibles</div></button>); })}
          </div>
        </div>
      )}

      {/* PROFILE TAB */}
      {activeTab === "profile" && (
        <div className="absolute inset-0 bg-white dark:bg-[#0e0e12] safe-top pt-4">
          <div className="px-5"><h1 className="text-3xl font-extrabold tracking-tight mb-4">Profil</h1></div>
          <div className="overflow-y-auto px-5 pb-24" style={{ height: "calc(100% - 120px)" }}>
            <div className="w-18 h-18 rounded-full bg-gray-100 dark:bg-gray-800/50 flex items-center justify-center mx-auto mb-3"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
            <div className="text-xl font-bold text-center mb-0.5 text-gray-900 dark:text-white">Utilisateur ParkSpot</div>
            <div className="text-sm text-gray-400 text-center mb-5">{city?.name || "France"}{city?.department ? ` · ${city.department}` : ""}</div>
            <div className="grid grid-cols-2 gap-2.5 mb-6">
              <div className="bg-gray-100 dark:bg-gray-800/50 rounded-2xl p-4 text-center"><div className="text-2xl font-bold text-gray-900 dark:text-white">{favorites.length}</div><div className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest font-semibold">Favoris</div></div>
              <div className="bg-gray-100 dark:bg-gray-800/50 rounded-2xl p-4 text-center"><div className="text-2xl font-bold text-gray-900 dark:text-white">{parkings.length}</div><div className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest font-semibold">Parkings</div></div>
            </div>

            {/* Parked car section */}
            {parkedCar && (
              <><div className="text-xs font-semibold text-gray-400 tracking-[1px] uppercase mb-2.5 pl-1">Ma voiture</div>
              <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-[14px] mb-5 flex items-center gap-3">
                <span className="text-2xl">🚗</span>
                <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{parkedCar.parkingName}</div><div className="text-xs text-gray-400">Garée il y a {parkedTimeText}</div></div>
                <button onClick={() => { setActiveTab("map"); setMapCenter([parkedCar.lat, parkedCar.lng]); setMapZoom(17); }} className="px-3 py-1.5 bg-[var(--accent)] text-white rounded-lg text-xs font-semibold active:opacity-80">Voir</button>
                <button onClick={clearParked} className="text-gray-400 text-sm">✕</button>
              </div></>
            )}

            <div className="text-xs font-semibold text-gray-400 tracking-[1px] uppercase mb-2.5 pl-1">Ville</div>
            <button onClick={changeCity} className="w-full p-4 bg-gray-100 dark:bg-gray-800/50 rounded-[14px] mb-2 flex items-center justify-between active:bg-gray-200 dark:active:bg-gray-700"><div className="flex items-center gap-3"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg><div><div className="text-sm font-semibold text-left text-gray-900 dark:text-white">{city?.name}</div><div className="text-xs text-gray-400">{city?.department || "Changer de ville"}</div></div></div><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300"><path d="M9 18l6-6-6-6"/></svg></button>
            <div className="text-xs font-semibold text-gray-400 tracking-[1px] uppercase mb-2.5 mt-5 pl-1">Préférences</div>
            <button onClick={()=>setDark(!dark)} className="w-full p-4 bg-gray-100 dark:bg-gray-800/50 rounded-[14px] mb-2 flex items-center justify-between active:bg-gray-200 dark:active:bg-gray-700"><div className="flex items-center gap-3"><span className="text-lg">🌙</span><div><div className="text-sm font-semibold text-left text-gray-900 dark:text-white">Mode sombre</div><div className="text-xs text-gray-400">Interface sombre pour la nuit</div></div></div><div className={`w-12 h-7 rounded-full relative ${dark?"bg-[var(--free)]":"bg-black/10"}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${dark?"left-6":"left-1"}`}/></div></button>
            <div className="text-xs font-semibold text-gray-400 tracking-[1px] uppercase mb-2.5 mt-5 pl-1">À propos</div>
            <div className="p-4 bg-gray-100 dark:bg-gray-800/50 rounded-[14px]"><div className="text-sm font-semibold text-gray-900 dark:text-white">ParkSpot v5.0</div><div className="text-xs text-gray-400 mt-0.5">Paris & IDF · Lyon · Bordeaux · Lille · Voirie</div></div>
          </div>
        </div>
      )}

      {!navigating && <TabBar active={activeTab} onChange={setActiveTab} />}
    </div>
  );
}
