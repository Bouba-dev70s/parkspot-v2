"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import TabBar, { type TabId } from "./components/TabBar";
import PeekSheet from "./components/PeekSheet";
import DetailSheet from "./components/DetailSheet";
import { loadParkingData, refreshSaemes, type Parking } from "@/lib/api";

const Map = dynamic(() => import("./components/Map"), { ssr: false });

export default function Home() {
  const [parkings, setParkings] = useState<Parking[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("map");
  const [selected, setSelected] = useState<Parking | null>(null);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [filter, setFilter] = useState("all");
  const [dataSource, setDataSource] = useState("loading");
  const [dark, setDark] = useState(false);

  // Load data
  useEffect(() => {
    loadParkingData().then(({ data, source }) => {
      setParkings(data);
      setDataSource(source);
      console.log(`[App] ${data.length} parkings from ${source}`);
    });
    const favs = JSON.parse(localStorage.getItem("parkspot_favs") || "[]");
    setFavorites(favs);
    setDark(localStorage.getItem("parkspot_theme") === "dark");
  }, []);

  // Dark mode
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("parkspot_theme", dark ? "dark" : "light");
  }, [dark]);

  // Saemes refresh every 2 min
  useEffect(() => {
    if (dataSource !== "api") return;
    const iv = setInterval(async () => {
      const updated = await refreshSaemes(parkings);
      setParkings(updated);
    }, 120000);
    return () => clearInterval(iv);
  }, [dataSource, parkings]);

  // Filtering
  const filtered = useMemo(() => {
    return parkings
      .filter((p) => {
        if (filter === "free" && p.type !== "free") return false;
        if (filter === "paid" && p.type !== "paid") return false;
        if (filter === "available" && p.avail === 0) return false;
        return true;
      })
      .sort((a, b) => {
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

  const toggleFav = useCallback((id: number) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem("parkspot_favs", JSON.stringify(next));
      return next;
    });
  }, []);

  const locate = useCallback(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }, []);

  const onSelect = useCallback((p: Parking) => setSelected(p), []);

  const filters = ["all", "free", "paid", "available"] as const;
  const filterLabels: Record<string, string> = { all: "Tous", free: "Gratuit", paid: "Payant", available: "Dispo" };

  return (
    <div className="h-[100dvh] w-full bg-white dark:bg-[#0e0e12] text-black dark:text-white">

      {/* === MAP SCREEN === */}
      {activeTab === "map" && (
        <div className="absolute inset-0">
          <Map parkings={filtered} onSelect={onSelect} userPos={userPos} />

          {/* Search + filters */}
          <div className="absolute top-3 left-4 right-4 z-[1000] safe-top">
            <div className="relative mb-3">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              <input
                type="text"
                placeholder="Rechercher un parking..."
                className="w-full pl-11 pr-4 py-3.5 bg-white dark:bg-[#1c1c24] border border-black/8 dark:border-white/8 rounded-2xl text-[15px] outline-none shadow-[0_4px_20px_rgba(0,0,0,0.12)]"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {filters.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-full text-[13px] font-medium whitespace-nowrap border shadow-sm
                    ${filter === f
                      ? f === "free" ? "bg-[var(--free-bg)] border-[var(--free)] text-[var(--free)]"
                      : f === "paid" ? "bg-[var(--paid-bg)] border-[var(--paid)] text-[var(--paid)]"
                      : "bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)]"
                      : "bg-white dark:bg-[#1c1c24] border-black/8 dark:border-white/8 text-black/50 dark:text-white/50"
                    }`}
                >
                  {filterLabels[f]}
                </button>
              ))}
            </div>
          </div>

          {/* Locate button */}
          <button onClick={locate} className="fixed bottom-[260px] right-4 z-[1000] w-12 h-12 rounded-full bg-white dark:bg-[#1c1c24] border border-black/8 dark:border-white/8 shadow-lg flex items-center justify-center text-[var(--accent)] active:scale-90 safe-bottom">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /><circle cx="12" cy="12" r="8" /></svg>
          </button>

          {/* Peek sheet */}
          {!selected && <PeekSheet parkings={filtered} onSelect={onSelect} freeCount={freeCount} paidCount={paidCount} />}

          {/* Detail sheet */}
          {selected && (
            <DetailSheet
              parking={selected}
              onClose={() => setSelected(null)}
              isFav={favorites.includes(selected.id)}
              onToggleFav={() => toggleFav(selected.id)}
              userPos={userPos}
            />
          )}
        </div>
      )}

      {/* === LIST SCREEN === */}
      {activeTab === "list" && (
        <div className="absolute inset-0 bg-white dark:bg-[#0e0e12] safe-top pt-4">
          <div className="px-5 pb-2">
            <h1 className="text-3xl font-extrabold tracking-tight mb-4">Explorer</h1>
            <input placeholder="Rechercher..." className="w-full px-4 py-3 bg-black/3 dark:bg-white/5 border border-black/8 dark:border-white/8 rounded-[14px] text-[15px] outline-none mb-3" />
          </div>
          <div className="overflow-y-auto px-5 pb-24" style={{ height: "calc(100dvh - 160px)", WebkitOverflowScrolling: "touch" }}>
            {filtered.map((p) => {
              const r = p.total > 0 ? p.avail / p.total : 0;
              return (
                <button key={p.id} onClick={() => { setSelected(p); setActiveTab("map"); }} className="w-full text-left p-4 bg-black/3 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl mb-2.5 relative overflow-hidden active:bg-black/5">
                  <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-r ${p.type === "free" ? "bg-[var(--free)]" : "bg-[var(--paid)]"}`} />
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-[15px] font-semibold">{p.name}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${p.type === "free" ? "bg-[var(--free-bg)] text-[var(--free)]" : "bg-[var(--paid-bg)] text-[var(--paid)]"}`}>{p.type === "free" ? "GRATUIT" : "PAYANT"}</span>
                  </div>
                  <div className="text-xs text-black/30 dark:text-white/30 mb-3">{p.addr} · {p.hours}</div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-black/5 dark:bg-white/5 rounded overflow-hidden">
                      <div className={`h-full rounded ${r > 0.3 ? "bg-[var(--free)]" : r > 0 ? "bg-[var(--paid)]" : "bg-[var(--full)]"}`} style={{ width: `${r * 100}%` }} />
                    </div>
                    <span className={`font-mono text-[13px] font-medium ${r > 0.3 ? "text-[var(--free)]" : r > 0 ? "text-[var(--paid)]" : "text-[var(--full)]"}`}>{p.avail}/{p.total}</span>
                  </div>
                  {p.price && <div className="font-mono text-xs text-[var(--paid)] mt-2">{p.price}</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* === FAV SCREEN === */}
      {activeTab === "fav" && (
        <div className="absolute inset-0 bg-white dark:bg-[#0e0e12] safe-top pt-4">
          <div className="px-5"><h1 className="text-3xl font-extrabold tracking-tight mb-4">Favoris</h1></div>
          <div className="overflow-y-auto px-5 pb-24" style={{ height: "calc(100dvh - 120px)", WebkitOverflowScrolling: "touch" }}>
            {favorites.length === 0 ? (
              <div className="text-center pt-16 text-black/30 dark:text-white/30">
                <div className="text-5xl mb-3 opacity-30">&#9733;</div>
                <div className="text-[15px] font-medium">Aucun parking sauvegarde</div>
                <div className="text-[13px] mt-1">Appuyez sur Sauvegarder pour ajouter un parking ici</div>
              </div>
            ) : (
              favorites.map((id) => {
                const p = parkings.find((x) => x.id === id);
                if (!p) return null;
                return (
                  <button key={id} onClick={() => { setSelected(p); setActiveTab("map"); }} className="w-full text-left p-4 bg-black/3 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl mb-2.5 active:bg-black/5">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-black/30 dark:text-white/30 mt-0.5">{p.addr}</div>
                    <div className="font-mono text-sm mt-2" style={{ color: p.avail > 0 ? "var(--free)" : "var(--full)" }}>{p.avail} disponibles</div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* === ALERTS SCREEN === */}
      {activeTab === "alerts" && (
        <div className="absolute inset-0 bg-white dark:bg-[#0e0e12] safe-top pt-4">
          <div className="px-5">
            <h1 className="text-3xl font-extrabold tracking-tight mb-1">Alertes</h1>
            <p className="text-sm text-black/30 dark:text-white/30 mb-5">Soyez notifie quand des places se liberent</p>
          </div>
          <div className="overflow-y-auto px-5 pb-24" style={{ height: "calc(100dvh - 160px)" }}>
            <div className="p-4 bg-[var(--card-bg)] rounded-[14px] mb-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HiOutlineBellIcon />
                <div><div className="text-sm font-semibold">Notifications push</div><div className="text-xs text-black/30 dark:text-white/30">Alerte quand un parking favori a des places</div></div>
              </div>
              <label className="relative w-12 h-7 shrink-0"><input type="checkbox" className="sr-only peer" /><div className="w-full h-full bg-black/10 dark:bg-white/10 rounded-full peer-checked:bg-[var(--free)] transition-colors" /><div className="absolute left-1 top-1 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" /></label>
            </div>
          </div>
        </div>
      )}

      {/* === PROFILE SCREEN === */}
      {activeTab === "profile" && (
        <div className="absolute inset-0 bg-white dark:bg-[#0e0e12] safe-top pt-4">
          <div className="px-5"><h1 className="text-3xl font-extrabold tracking-tight mb-4">Profil</h1></div>
          <div className="overflow-y-auto px-5 pb-24" style={{ height: "calc(100dvh - 120px)" }}>
            <div className="w-18 h-18 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mx-auto mb-3">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-black/30 dark:text-white/30"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            </div>
            <div className="text-xl font-bold text-center mb-0.5">Utilisateur ParkSpot</div>
            <div className="text-sm text-black/30 dark:text-white/30 text-center mb-5">Ile-de-France</div>

            <div className="grid grid-cols-3 gap-2 mb-6">
              <div className="bg-[var(--card-bg)] rounded-xl p-3.5 text-center"><div className="font-mono text-xl font-semibold">{favorites.length}</div><div className="text-[10px] text-black/30 dark:text-white/30 mt-0.5 uppercase">Favoris</div></div>
              <div className="bg-[var(--card-bg)] rounded-xl p-3.5 text-center"><div className="font-mono text-xl font-semibold">{parkings.length}</div><div className="text-[10px] text-black/30 dark:text-white/30 mt-0.5 uppercase">Parkings</div></div>
              <div className="bg-[var(--card-bg)] rounded-xl p-3.5 text-center"><div className="font-mono text-xl font-semibold capitalize">{dataSource === "api" ? "Live" : dataSource}</div><div className="text-[10px] text-black/30 dark:text-white/30 mt-0.5 uppercase">Source</div></div>
            </div>

            <div className="text-xs font-semibold text-black/30 dark:text-white/30 tracking-[1px] uppercase mb-2.5 pl-1">Preferences</div>
            <button onClick={() => setDark(!dark)} className="w-full p-4 bg-[var(--card-bg)] rounded-[14px] mb-2 flex items-center justify-between active:bg-black/5">
              <div className="flex items-center gap-3">
                <span className="text-lg">🌙</span>
                <div><div className="text-sm font-semibold text-left">Mode sombre</div><div className="text-xs text-black/30 dark:text-white/30">Interface sombre pour la nuit</div></div>
              </div>
              <div className={`w-12 h-7 rounded-full relative ${dark ? "bg-[var(--free)]" : "bg-black/10"}`}>
                <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${dark ? "left-6" : "left-1"}`} />
              </div>
            </button>

            <div className="text-xs font-semibold text-black/30 dark:text-white/30 tracking-[1px] uppercase mb-2.5 mt-5 pl-1">A propos</div>
            <div className="p-4 bg-[var(--card-bg)] rounded-[14px]">
              <div className="text-sm font-semibold">ParkSpot v2.0</div>
              <div className="text-xs text-black/30 dark:text-white/30 mt-0.5">Next.js · Open Data Paris · Saemes · BNLS · IDFM</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Bar */}
      <TabBar active={activeTab} onChange={setActiveTab} />
    </div>
  );
}

function HiOutlineBellIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>;
}
