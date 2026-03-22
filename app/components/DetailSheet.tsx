"use client";
import { useRef, useCallback, useMemo, useState } from "react";
import { HiOutlineBookmark, HiBookmark, HiOutlineArrowRight, HiX, HiOutlineShare, HiOutlineLocationMarker } from "react-icons/hi";
import type { Parking } from "@/lib/api";
import { estimatePrice, distanceKm } from "@/lib/api";

interface Props { parking: Parking | null; onClose: () => void; isFav: boolean; onToggleFav: () => void; userPos: [number, number] | null; onParkHere?: () => void; }

export default function DetailSheet({ parking, onClose, isFav, onToggleFav, userPos, onParkHere }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const sy = useRef(0); const cy = useRef(0); const dr = useRef(false);
  const [duration, setDuration] = useState(2);
  const [shared, setShared] = useState(false);
  const onTS = useCallback((e: React.TouchEvent) => { sy.current = e.touches[0].clientY; dr.current = true; ref.current?.classList.add("sheet-dragging"); }, []);
  const onTM = useCallback((e: React.TouchEvent) => { if (!dr.current || !ref.current) return; cy.current = e.touches[0].clientY; const d = cy.current - sy.current; if (d > 0) ref.current.style.transform = `translateY(${d}px)`; }, []);
  const onTE = useCallback(() => { if (!dr.current) return; dr.current = false; ref.current?.classList.remove("sheet-dragging"); if (cy.current - sy.current > 80) { onClose(); if (ref.current) ref.current.style.transform = ""; } else if (ref.current) ref.current.style.transform = "translateY(0)"; sy.current = 0; cy.current = 0; }, [onClose]);
  const p = parking;
  const isEst = p && !p.realtime;
  const pct = p && p.total > 0 ? p.avail / p.total : 0;
  const vc = pct > 0.3 ? "var(--free)" : pct > 0 ? "var(--paid)" : "var(--full)";
  const dist = useMemo(() => { if (!p || !userPos) return null; const d = distanceKm(userPos[0], userPos[1], p.lat, p.lng); return d < 1 ? `${Math.round(d * 1000)}m` : `${d.toFixed(1)}km`; }, [p, userPos]);
  const walkMin = useMemo(() => { if (!p || !userPos) return null; const d = distanceKm(userPos[0], userPos[1], p.lat, p.lng); return `${Math.round(d * 12)} min à pied`; }, [p, userPos]);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => { const b = i >= 7 && i <= 9 ? 0.9 : i >= 17 && i <= 19 ? 0.85 : i >= 10 && i <= 16 ? 0.6 : i >= 20 && i <= 22 ? 0.4 : 0.15; return Math.min(1, b + Math.random() * 0.15); }), [p?.id]);
  const navigateTo = () => { if (!p) return; const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent); if (iOS) window.open(`maps://maps.apple.com/?daddr=${p.lat},${p.lng}&dirflg=d`); else window.open(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`); };

  async function sharePark() {
    if (!p) return;
    const text = `${p.name} — ${p.type === "free" ? "Gratuit" : p.price} · ${p.total} places\nhttps://www.google.com/maps?q=${p.lat},${p.lng}`;
    if (navigator.share) { try { await navigator.share({ title: `ParkSpot · ${p.name}`, text }); } catch {} }
    else { await navigator.clipboard.writeText(text); setShared(true); setTimeout(() => setShared(false), 2000); }
  }

  if (!p) return null;
  const nowH = new Date().getHours();
  const est = estimatePrice(p, duration);
  const svc = p.services;

  // Clean price display
  const priceDisplay = p.price ? p.price.replace("€/h", "") : "0";
  const priceUnit = p.price ? "€/h" : "€";

  return (
    <div ref={ref} className={`fixed bottom-0 left-0 right-0 z-[1800] bg-white dark:bg-[#131318] rounded-t-3xl border-t border-black/8 dark:border-white/8 shadow-[0_-8px_30px_rgba(0,0,0,0.1)] safe-bottom overflow-y-auto ${parking ? "sheet-visible" : "sheet-enter"}`}
      style={{ maxHeight: "85vh", paddingBottom: "calc(68px + max(8px, env(safe-area-inset-bottom, 8px)))" }}>
      {/* Handle + close */}
      <div className="relative" onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}>
        <div className="flex justify-center py-2.5 cursor-pointer" onClick={onClose}><div className="w-9 h-1 bg-black/15 dark:bg-white/15 rounded-full" /></div>
        <button onClick={onClose} className="absolute top-2 right-4 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 active:bg-gray-200 dark:active:bg-gray-700 z-10"><HiX size={16} /></button>
      </div>

      <div className="px-6 pb-5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${p.type === "free" ? "bg-[var(--free-bg)] text-[var(--free)]" : "bg-[var(--paid-bg)] text-[var(--paid)]"}`}>{p.type === "free" ? "Gratuit" : "Payant"}</span>
          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${p.realtime ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" : "bg-gray-100 dark:bg-gray-800 text-gray-400"}`}>{p.realtime ? "Temps réel" : "Estimé"}</span>
          {dist && <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500">{dist}</span>}
        </div>

        <h2 className="text-xl font-bold tracking-tight mb-1 text-gray-900 dark:text-white pr-8">{p.name}</h2>
        <p className="text-[13px] text-gray-400 mb-1">{p.addr}{p.city ? ` · ${p.city}` : ""}</p>
        {walkMin && <p className="text-[12px] text-gray-400 mb-4">{p.hours} · {walkMin}</p>}
        {!walkMin && <p className="text-[12px] text-gray-400 mb-4">{p.hours}</p>}

        {/* Services — clean text badges, no emojis */}
        <div className="flex gap-1.5 flex-wrap mb-5">
          {svc.couvert && <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-[11px] font-semibold text-gray-500 dark:text-gray-400">Couvert</span>}
          {svc.pmr && <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-[11px] font-semibold text-blue-500">PMR</span>}
          {svc.electrique && <span className="px-2.5 py-1 bg-green-50 dark:bg-green-900/20 rounded-lg text-[11px] font-semibold text-green-600">Électrique</span>}
          {svc.surveillance && <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-[11px] font-semibold text-gray-500 dark:text-gray-400">Surveillé</span>}
          {svc.velo && <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-[11px] font-semibold text-gray-500 dark:text-gray-400">Vélos</span>}
          {svc.moto && <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-[11px] font-semibold text-gray-500 dark:text-gray-400">Motos</span>}
          {svc.autopartage && <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-[11px] font-semibold text-gray-500 dark:text-gray-400">Autopartage</span>}
          {svc.hauteurMax && <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-[11px] font-semibold text-gray-500 dark:text-gray-400">H. {svc.hauteurMax}</span>}
        </div>

        {/* Stats — fixed size, no overflow */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="bg-gray-50 dark:bg-gray-800/40 rounded-2xl p-3 text-center">
            <div className="text-2xl font-bold" style={{ color: vc }}>{isEst ? "~" : ""}{p.avail}</div>
            <div className="text-[10px] text-gray-400 mt-1 font-medium">{isEst ? "Estimé" : "Dispo"}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/40 rounded-2xl p-3 text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{p.total}</div>
            <div className="text-[10px] text-gray-400 mt-1 font-medium">Total</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/40 rounded-2xl p-3 text-center">
            <div className="text-2xl font-bold" style={{ color: p.price ? "var(--paid)" : "var(--free)" }}>{priceDisplay}<span className="text-sm font-semibold">{priceUnit}</span></div>
            <div className="text-[10px] text-gray-400 mt-1 font-medium">Tarif</div>
          </div>
        </div>

        {/* Occupation bar */}
        <div className="mb-5">
          <div className="flex justify-between text-[11px] text-gray-400 mb-1.5 font-medium">
            <span>Occupation{isEst ? " (estimée)" : ""}</span>
            <span style={{ color: vc }}>{isEst ? "~" : ""}{Math.round(pct * 100)}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: vc, transition: "width 0.5s" }} />
          </div>
        </div>

        {/* Estimation notice — subtle, not a big box */}
        {isEst && (
          <p className="text-[11px] text-gray-400 mb-5 leading-relaxed">
            <span className="text-blue-400 font-semibold">~</span> Estimation basée sur l&apos;heure et le jour. Données temps réel non disponibles pour ce parking.
          </p>
        )}

        {/* Affluence chart */}
        <div className="mb-5">
          <div className="text-[11px] font-semibold text-gray-400 mb-2">Affluence typique</div>
          <div className="flex gap-[2px] items-end h-8">
            {hours.map((h, i) => (
              <div key={i} className="flex-1 rounded-sm" style={{
                height: `${Math.max(3, h * 32)}px`,
                background: i === nowH ? "var(--accent)" : h > 0.7 ? "var(--full)" : h > 0.4 ? "var(--paid)" : "var(--free)",
                opacity: i === nowH ? 1 : 0.4,
              }} />
            ))}
          </div>
          <div className="flex justify-between mt-1"><span className="text-[9px] text-gray-300">0h</span><span className="text-[9px] text-gray-300">6h</span><span className="text-[9px] text-gray-300">12h</span><span className="text-[9px] text-gray-300">18h</span><span className="text-[9px] text-gray-300">23h</span></div>
        </div>

        {/* Price estimator — compact */}
        {p.type !== "free" && (
          <div className="bg-gray-50 dark:bg-gray-800/40 rounded-2xl p-4 mb-5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Coût estimé</span>
              <span className="text-xl font-bold" style={{ color: "var(--paid)" }}>{est}</span>
            </div>
            <input type="range" min="0.5" max="24" step="0.5" value={duration} onChange={(e) => setDuration(parseFloat(e.target.value))} className="w-full accent-[var(--accent)] h-1" />
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-gray-400">30 min</span>
              <span className="text-[11px] font-medium text-gray-500">{duration < 1 ? `${duration * 60} min` : duration === 1 ? "1h" : `${duration}h`}</span>
              <span className="text-[10px] text-gray-400">24h</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button onClick={navigateTo} className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[var(--free)] text-black font-semibold text-[13px] active:scale-[0.97]"><HiOutlineArrowRight size={16} /> Itinéraire</button>
          <button onClick={onToggleFav} className={`flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-[13px] active:scale-[0.97] ${isFav ? "bg-[var(--paid-bg)] text-[var(--paid)]" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}>{isFav ? <HiBookmark size={16} /> : <HiOutlineBookmark size={16} />} {isFav ? "Sauvegardé" : "Sauvegarder"}</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={sharePark} className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium text-[13px] active:scale-[0.97]"><HiOutlineShare size={14} /> {shared ? "Copié !" : "Partager"}</button>
          <button onClick={onParkHere} className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-[var(--accent)] font-medium text-[13px] active:scale-[0.97]"><HiOutlineLocationMarker size={14} /> Garé ici</button>
        </div>
      </div>
    </div>
  );
}
