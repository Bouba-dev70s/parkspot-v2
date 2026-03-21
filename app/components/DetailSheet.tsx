"use client";
import { useRef, useCallback, useMemo, useState } from "react";
import { HiOutlineBookmark, HiBookmark, HiOutlineArrowRight } from "react-icons/hi";
import type { Parking } from "@/lib/api";
import { estimatePrice, distanceKm } from "@/lib/api";

interface Props {
  parking: Parking | null;
  onClose: () => void;
  isFav: boolean;
  onToggleFav: () => void;
  userPos: [number, number] | null;
}

export default function DetailSheet({ parking, onClose, isFav, onToggleFav, userPos }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const sy = useRef(0); const cy = useRef(0); const dr = useRef(false);
  const [duration, setDuration] = useState(2);

  const onTS = useCallback((e: React.TouchEvent) => { sy.current = e.touches[0].clientY; dr.current = true; ref.current?.classList.add("sheet-dragging"); }, []);
  const onTM = useCallback((e: React.TouchEvent) => { if (!dr.current || !ref.current) return; cy.current = e.touches[0].clientY; const d = cy.current - sy.current; if (d > 0) ref.current.style.transform = `translateY(${d}px)`; }, []);
  const onTE = useCallback(() => { if (!dr.current) return; dr.current = false; ref.current?.classList.remove("sheet-dragging"); if (cy.current - sy.current > 80) { onClose(); if (ref.current) ref.current.style.transform = ""; } else if (ref.current) ref.current.style.transform = "translateY(0)"; sy.current = 0; cy.current = 0; }, [onClose]);

  const p = parking;
  const pct = p && p.total > 0 ? p.avail / p.total : 0;
  const vc = pct > 0.3 ? "var(--free)" : pct > 0 ? "var(--paid)" : "var(--full)";

  const dist = useMemo(() => {
    if (!p || !userPos) return null;
    const d = distanceKm(userPos[0], userPos[1], p.lat, p.lng);
    return { text: d < 1 ? `${Math.round(d * 1000)}m` : `${d.toFixed(1)}km`, walk: `~${Math.round(d * 12)} min` };
  }, [p, userPos]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => {
    const b = i >= 7 && i <= 9 ? 0.9 : i >= 17 && i <= 19 ? 0.85 : i >= 10 && i <= 16 ? 0.6 : i >= 20 && i <= 22 ? 0.4 : 0.15;
    return Math.min(1, b + Math.random() * 0.15);
  }), [p?.id]);

  const navigateTo = () => {
    if (!p) return;
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (iOS) window.open(`maps://maps.apple.com/?daddr=${p.lat},${p.lng}&dirflg=d`);
    else window.open(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`);
  };

  const lastUpdateText = useMemo(() => {
    if (!p) return "";
    try {
      const d = new Date(p.lastUpdate);
      const diff = Math.floor((Date.now() - d.getTime()) / 60000);
      if (diff < 2) return "A l'instant";
      if (diff < 60) return `Il y a ${diff} min`;
      if (diff < 1440) return `Il y a ${Math.floor(diff / 60)}h`;
      return `Il y a ${Math.floor(diff / 1440)}j`;
    } catch { return ""; }
  }, [p]);

  if (!p) return null;
  const nowH = new Date().getHours();
  const est = estimatePrice(p, duration);
  const svc = p.services;

  // Build services list from real data
  const servicesList = [];
  if (svc.couvert) servicesList.push({ icon: "🏢", label: "Couvert" });
  if (svc.pmr) servicesList.push({ icon: "♿", label: "PMR" });
  if (svc.electrique) servicesList.push({ icon: "⚡", label: "Electrique" });
  if (svc.surveillance) servicesList.push({ icon: "👁", label: "Surveille" });
  if (svc.velo) servicesList.push({ icon: "🚲", label: "Velos" });
  if (svc.moto) servicesList.push({ icon: "🏍", label: "Motos" });
  if (svc.autopartage) servicesList.push({ icon: "🚗", label: "Autopartage" });
  if (svc.hauteurMax) servicesList.push({ icon: "📏", label: svc.hauteurMax });
  if (servicesList.length === 0) servicesList.push({ icon: "🅿️", label: "Standard" });

  return (
    <div ref={ref} className={`fixed bottom-0 left-0 right-0 z-[1800] bg-white dark:bg-[#131318] rounded-t-3xl border-t border-black/8 dark:border-white/8 shadow-[0_-8px_30px_rgba(0,0,0,0.1)] safe-bottom overflow-y-auto ${parking ? "sheet-visible" : "sheet-enter"}`}
      style={{ maxHeight: "85vh", paddingBottom: "calc(68px + max(8px, env(safe-area-inset-bottom, 8px)))" }}>
      <div className="flex justify-center py-2.5 cursor-pointer" onClick={onClose} onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}>
        <div className="w-9 h-1 bg-black/15 dark:bg-white/15 rounded-full" />
      </div>
      <div className="px-6 pb-5">
        {/* Realtime badge + type */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-[11px] font-semibold tracking-[2px] uppercase ${p.type === "free" ? "text-[var(--free)]" : "text-[var(--paid)]"}`}>{p.type === "free" ? "Gratuit" : "Payant"}</span>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${p.realtime ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" : "bg-orange-100 dark:bg-orange-900/30 text-orange-500 dark:text-orange-400"}`}>
            {p.realtime ? "⚡ Temps reel" : "~ Estime"}
          </span>
        </div>

        <h2 className="text-2xl font-bold tracking-tight mb-1 text-gray-900 dark:text-white">{p.name}</h2>
        <p className="text-sm text-gray-400 mb-1">{p.addr}{p.city ? ` · ${p.city}` : ""}</p>
        <p className="text-xs text-gray-400 mb-4">
          {p.hours}{dist ? ` · ${dist.text} ${dist.walk}` : ""}
          {lastUpdateText ? ` · Maj ${lastUpdateText}` : ""}
        </p>

        {/* Real services */}
        <div className="flex gap-1.5 flex-wrap mb-4">
          {servicesList.map((s, i) => (
            <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-gray-800/50 rounded-full text-[11px] font-medium text-gray-600 dark:text-gray-400">
              {s.icon} {s.label}
            </span>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          <div className="bg-gray-100 dark:bg-gray-800/50 rounded-[14px] p-4 text-center"><div className="font-mono text-[28px] font-semibold" style={{ color: vc }}>{p.avail}</div><div className="text-[11px] text-gray-400 mt-1">Disponibles</div></div>
          <div className="bg-gray-100 dark:bg-gray-800/50 rounded-[14px] p-4 text-center"><div className="font-mono text-[28px] font-semibold text-gray-900 dark:text-white">{p.total}</div><div className="text-[11px] text-gray-400 mt-1">Total</div></div>
          <div className="bg-gray-100 dark:bg-gray-800/50 rounded-[14px] p-4 text-center"><div className="font-mono text-[28px] font-semibold" style={{ color: p.price ? "var(--paid)" : "var(--free)" }}>{p.price || "0€"}</div><div className="text-[11px] text-gray-400 mt-1">Tarif</div></div>
        </div>

        {/* Occupancy */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-2"><span>Occupation</span><span style={{ color: vc }}>{Math.round(pct * 100)}% disponible</span></div>
          <div className="h-2 bg-black/5 dark:bg-white/5 rounded overflow-hidden"><div className="h-full rounded" style={{ width: `${pct * 100}%`, background: vc, transition: "width 0.5s" }} /></div>
        </div>

        {/* Hours chart */}
        <div className="mb-4">
          <div className="text-xs font-semibold text-gray-400 tracking-wide mb-2">Affluence estimee</div>
          <div className="flex gap-[2px] items-end h-10">
            {hours.map((h, i) => (<div key={i} className="hour-bar flex-1" style={{ height: `${Math.max(4, h * 40)}px`, background: i === nowH ? "var(--accent)" : h > 0.7 ? "var(--full)" : h > 0.4 ? "var(--paid)" : "var(--free)", opacity: i === nowH ? 1 : 0.5 }} />))}
          </div>
        </div>

        {/* Price estimator */}
        <div className="bg-gray-100 dark:bg-gray-800/50 rounded-xl p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Estimation du prix</span>
            <span className="font-mono text-lg font-bold" style={{ color: p.type === "free" ? "var(--free)" : "var(--paid)" }}>{est}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 shrink-0">30m</span>
            <input type="range" min="0.5" max="24" step="0.5" value={duration} onChange={(e) => setDuration(parseFloat(e.target.value))} className="flex-1 accent-[var(--accent)]" style={{ height: "4px" }} />
            <span className="text-xs text-gray-400 shrink-0">24h</span>
          </div>
          <div className="text-center text-xs text-gray-500 mt-2">{duration < 1 ? `${duration * 60} min` : duration === 1 ? "1 heure" : `${duration} heures`}</div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2.5">
          <button onClick={navigateTo} className="flex items-center justify-center gap-2 p-4 rounded-[14px] bg-[var(--free)] text-black font-semibold text-sm active:scale-[0.97]"><HiOutlineArrowRight size={16} /> Itineraire</button>
          <button onClick={onToggleFav} className={`flex items-center justify-center gap-2 p-4 rounded-[14px] font-semibold text-sm active:scale-[0.97] ${isFav ? "bg-[var(--paid-bg)] text-[var(--paid)]" : "bg-gray-100 dark:bg-gray-800/50 border border-black/8 dark:border-white/8 text-gray-900 dark:text-white"}`}>
            {isFav ? <HiBookmark size={16} /> : <HiOutlineBookmark size={16} />} {isFav ? "Sauvegarde" : "Sauvegarder"}
          </button>
        </div>
      </div>
    </div>
  );
}
