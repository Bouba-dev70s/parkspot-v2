"use client";
import { useRef, useCallback, useMemo } from "react";
import { HiOutlineBookmark, HiBookmark, HiOutlineArrowRight, HiCheck } from "react-icons/hi";
import type { Parking } from "@/lib/api";

interface Props {
  parking: Parking | null;
  onClose: () => void;
  isFav: boolean;
  onToggleFav: () => void;
  userPos: [number, number] | null;
}

export default function DetailSheet({ parking, onClose, isFav, onToggleFav, userPos }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const sy = useRef(0);
  const cy = useRef(0);
  const dragging = useRef(false);

  const onTS = useCallback((e: React.TouchEvent) => {
    sy.current = e.touches[0].clientY; dragging.current = true;
    ref.current?.classList.add("sheet-dragging");
  }, []);
  const onTM = useCallback((e: React.TouchEvent) => {
    if (!dragging.current || !ref.current) return;
    cy.current = e.touches[0].clientY;
    const dy = cy.current - sy.current;
    if (dy > 0) ref.current.style.transform = `translateY(${dy}px)`;
  }, []);
  const onTE = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    ref.current?.classList.remove("sheet-dragging");
    if (cy.current - sy.current > 80) { onClose(); if (ref.current) ref.current.style.transform = ""; }
    else if (ref.current) ref.current.style.transform = "translateY(0)";
    sy.current = 0; cy.current = 0;
  }, [onClose]);

  const p = parking;
  const pct = p && p.total > 0 ? p.avail / p.total : 0;
  const vc = pct > 0.3 ? "var(--free)" : pct > 0 ? "var(--paid)" : "var(--full)";

  const distance = useMemo(() => {
    if (!p || !userPos) return null;
    const d = Math.sqrt(Math.pow((p.lat - userPos[0]) * 111, 2) + Math.pow((p.lng - userPos[1]) * 74, 2));
    const txt = d < 1 ? `${Math.round(d * 1000)}m` : `${d.toFixed(1)}km`;
    return `${txt} · ~${Math.round(d * 12)} min`;
  }, [p, userPos]);

  const hours = useMemo(() =>
    Array.from({ length: 24 }, (_, i) => {
      const base = i >= 7 && i <= 9 ? 0.9 : i >= 17 && i <= 19 ? 0.85 : i >= 10 && i <= 16 ? 0.6 : i >= 20 && i <= 22 ? 0.4 : 0.15;
      return Math.min(1, base + Math.random() * 0.15);
    }), [p?.id]);

  const navigateTo = () => {
    if (!p) return;
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (iOS) window.open(`maps://maps.apple.com/?daddr=${p.lat},${p.lng}&dirflg=d`);
    else window.open(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`);
  };

  if (!p) return null;
  const nowHour = new Date().getHours();
  const priceVal = p.price ? parseFloat(p.price) : 0;

  return (
    <div
      ref={ref}
      className={`fixed bottom-0 left-0 right-0 z-[1800] bg-white dark:bg-[#131318] rounded-t-3xl border-t border-black/8 dark:border-white/8 shadow-[0_-8px_30px_rgba(0,0,0,0.1)] safe-bottom overflow-y-auto
        ${parking ? "sheet-visible" : "sheet-enter"}`}
      style={{ maxHeight: "85vh", paddingBottom: "calc(68px + max(8px, env(safe-area-inset-bottom, 8px)))" }}
    >
      {/* Handle */}
      <div className="flex justify-center py-2.5 cursor-pointer" onClick={onClose} onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}>
        <div className="w-9 h-1 bg-black/15 dark:bg-white/15 rounded-full" />
      </div>

      <div className="px-6 pb-5">
        {/* Type badge */}
        <div className={`text-[11px] font-semibold tracking-[2px] uppercase mb-1.5 ${p.type === "free" ? "text-[var(--free)]" : "text-[var(--paid)]"}`}>
          {p.type === "free" ? "Parking gratuit" : "Parking payant"}
        </div>

        {/* Name & address */}
        <h2 className="text-2xl font-bold tracking-tight mb-1">{p.name}</h2>
        <p className="text-sm text-black/30 dark:text-white/30 mb-4">
          {p.addr} · {p.hours}{distance ? ` · ${distance}` : ""}
        </p>

        {/* Services */}
        <div className="flex gap-2 flex-wrap mb-4">
          {["Couvert", "24/7", "PMR", "Electrique"].map((s) => (
            <span key={s} className="flex items-center gap-1 px-3 py-1 bg-gray-100 dark:bg-gray-800/50 rounded-full text-[11px] font-medium text-black/50 dark:text-white/50">
              <HiCheck size={12} /> {s}
            </span>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          <div className="bg-gray-100 dark:bg-gray-800/50 rounded-[14px] p-4 text-center">
            <div className="font-mono text-[28px] font-semibold" style={{ color: vc }}>{p.avail}</div>
            <div className="text-[11px] text-black/30 dark:text-white/30 mt-1">Disponibles</div>
          </div>
          <div className="bg-gray-100 dark:bg-gray-800/50 rounded-[14px] p-4 text-center">
            <div className="font-mono text-[28px] font-semibold">{p.total}</div>
            <div className="text-[11px] text-black/30 dark:text-white/30 mt-1">Total</div>
          </div>
          <div className="bg-gray-100 dark:bg-gray-800/50 rounded-[14px] p-4 text-center">
            <div className="font-mono text-[28px] font-semibold" style={{ color: p.price ? "var(--paid)" : "var(--free)" }}>{p.price || "0€"}</div>
            <div className="text-[11px] text-black/30 dark:text-white/30 mt-1">Tarif</div>
          </div>
        </div>

        {/* Occupancy bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-black/50 dark:text-white/50 mb-2">
            <span>Occupation</span>
            <span style={{ color: vc }}>{Math.round(pct * 100)}% disponible</span>
          </div>
          <div className="h-2 bg-black/5 dark:bg-white/5 rounded overflow-hidden">
            <div className="h-full rounded transition-all duration-500" style={{ width: `${pct * 100}%`, background: vc }} />
          </div>
        </div>

        {/* Hours chart */}
        <div className="mb-4">
          <div className="text-xs font-semibold text-black/30 dark:text-white/30 tracking-wide mb-2">Affluence estimee</div>
          <div className="flex gap-[2px] items-end h-10">
            {hours.map((h, i) => (
              <div
                key={i}
                className="hour-bar flex-1"
                style={{
                  height: `${Math.max(4, h * 40)}px`,
                  background: i === nowHour ? "var(--accent)" : h > 0.7 ? "var(--full)" : h > 0.4 ? "var(--paid)" : "var(--free)",
                  opacity: i === nowHour ? 1 : 0.5,
                }}
              />
            ))}
          </div>
        </div>

        {/* Pricing */}
        {p.price ? (
          <div className="bg-gray-100 dark:bg-gray-800/50 rounded-xl p-3 mb-4">
            {[["1 heure", p.price], ["2 heures", `${(priceVal * 1.8).toFixed(2)}€`], ["24 heures", `${(priceVal * 6).toFixed(2)}€`], ["Abonnement/mois", `~${(priceVal * 90).toFixed(0)}€`]].map(([l, v]) => (
              <div key={l} className="flex justify-between py-1 text-[13px]">
                <span className="text-black/50 dark:text-white/50">{l}</span>
                <span className="font-mono font-medium">{v}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-100 dark:bg-gray-800/50 rounded-xl p-3 mb-4">
            <div className="flex justify-between py-1 text-[13px]">
              <span className="text-black/50 dark:text-white/50">Tarif</span>
              <span className="font-mono font-medium" style={{ color: "var(--free)" }}>Gratuit</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2.5">
          <button onClick={navigateTo} className="flex items-center justify-center gap-2 p-4 rounded-[14px] bg-[var(--free)] text-black font-semibold text-sm active:scale-[0.97]">
            <HiOutlineArrowRight size={16} /> Itineraire
          </button>
          <button onClick={onToggleFav} className={`flex items-center justify-center gap-2 p-4 rounded-[14px] font-semibold text-sm active:scale-[0.97] ${isFav ? "bg-[var(--paid-bg)] text-[var(--paid)]" : "bg-gray-100 dark:bg-gray-800/50 border border-black/8 dark:border-white/8"}`}>
            {isFav ? <HiBookmark size={16} /> : <HiOutlineBookmark size={16} />}
            {isFav ? "Sauvegarde" : "Sauvegarder"}
          </button>
        </div>
      </div>
    </div>
  );
}
