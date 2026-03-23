"use client";
import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { HiOutlineBookmark, HiBookmark, HiX, HiOutlineShare, HiOutlineLocationMarker } from "react-icons/hi";
import type { Parking } from "@/lib/api";
import { estimatePrice, distanceKm } from "@/lib/api";
import { getVoirieComparison } from "@/lib/voirie";
import { predictAvailability, predictionSummary, confidenceColor } from "@/lib/prediction";
import { submitReport, getCrowdStatus } from "@/lib/backend";

interface Props { parking: Parking | null; onClose: () => void; isFav: boolean; onToggleFav: () => void; userPos: [number, number] | null; onParkHere?: () => void; onNavigate?: (mode: "driving" | "walking") => void; }

export default function DetailSheet({ parking, onClose, isFav, onToggleFav, userPos, onParkHere, onNavigate }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const sy = useRef(0); const cy = useRef(0); const dr = useRef(false);
  const [duration, setDuration] = useState(2);
  const [shared, setShared] = useState(false);
  const [reported, setReported] = useState<string | null>(null);
  const [crowdStatus, setCrowdStatus] = useState<{ status: string; count: number; lastReport: string } | null>(null);
  const onTS = useCallback((e: React.TouchEvent) => { sy.current = e.touches[0].clientY; dr.current = true; ref.current?.classList.add("sheet-dragging"); }, []);
  const onTM = useCallback((e: React.TouchEvent) => { if (!dr.current || !ref.current) return; cy.current = e.touches[0].clientY; const d = cy.current - sy.current; if (d > 0) ref.current.style.transform = `translateY(${d}px)`; }, []);
  const onTE = useCallback(() => { if (!dr.current) return; dr.current = false; ref.current?.classList.remove("sheet-dragging"); if (cy.current - sy.current > 80) { onClose(); if (ref.current) ref.current.style.transform = ""; } else if (ref.current) ref.current.style.transform = "translateY(0)"; sy.current = 0; cy.current = 0; }, [onClose]);
  const p = parking;
  const isEst = p && !p.realtime;
  const pct = p && p.total > 0 ? p.avail / p.total : 0;
  const vc = pct > 0.3 ? "var(--free)" : pct > 0 ? "var(--paid)" : "var(--full)";
  const dist = useMemo(() => { if (!p || !userPos) return null; const d = distanceKm(userPos[0], userPos[1], p.lat, p.lng); return d < 1 ? `${Math.round(d * 1000)}m` : `${d.toFixed(1)}km`; }, [p, userPos]);
  const walkMin = useMemo(() => { if (!p || !userPos) return null; const d = distanceKm(userPos[0], userPos[1], p.lat, p.lng); return `${Math.round(d * 12)} min à pied`; }, [p, userPos]);

  // Fetch crowd reports for this parking
  useEffect(() => {
    if (!p) return;
    setReported(null);
    setCrowdStatus(null);
    getCrowdStatus(p.name).then(s => { if (s) setCrowdStatus(s); });
  }, [p?.id]);

  async function reportStatus(status: "full" | "few" | "many") {
    if (!p) return;
    setReported(status);
    await submitReport(p.name, p.lat, p.lng, status);
  }
  const navigateTo = () => { if (!p) return; const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent); if (iOS) window.open(`maps://maps.apple.com/?daddr=${p.lat},${p.lng}&dirflg=d`); else window.open(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`); };

  async function sharePark() {
    if (!p) return;
    const text = `${p.name} — ${p.type === "free" ? "Gratuit" : p.price} · ${p.total} places\nhttps://www.google.com/maps?q=${p.lat},${p.lng}`;
    if (navigator.share) { try { await navigator.share({ title: `ParkSpot · ${p.name}`, text }); } catch {} }
    else { await navigator.clipboard.writeText(text); setShared(true); setTimeout(() => setShared(false), 2000); }
  }

  if (!p) return null;
  const est = estimatePrice(p, duration);
  const svc = p.services;

  // Clean price display
  const priceDisplay = p.price ? p.price.replace("€/h", "") : "0";
  const priceUnit = p.price ? "€/h" : "€";

  return (
    <div ref={ref} className={`fixed bottom-0 left-0 right-0 z-[1800] bg-white dark:bg-[#131318] rounded-t-3xl border-t border-black/8 dark:border-white/8 shadow-[0_-8px_30px_rgba(0,0,0,0.1)] safe-bottom overflow-y-auto detail-enter`}
      style={{ maxHeight: "85vh", paddingBottom: "100px" }}>
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

        {/* === SMART PREDICTION === */}
        {(() => {
          const pred = predictAvailability(p.total, p.name, p.addr, p.realtime, p.realtime ? p.avail : undefined);
          const summary = predictionSummary(pred, p.total);
          const confColor = confidenceColor(pred.confidence);
          const nowH = new Date().getHours();
          const maxForecast = Math.max(...pred.hourlyForecast, 1);

          return (
            <div className="mb-5">
              {/* Prediction header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={confColor} strokeWidth="2"><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/><circle cx="12" cy="12" r="6"/></svg>
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Prédiction</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: confColor }} />
                  <span className="text-[10px] font-medium" style={{ color: confColor }}>Confiance {pred.confidenceLabel.toLowerCase()}</span>
                </div>
              </div>

              {/* Summary + trend */}
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">{summary}</span>
                <div className="flex items-center gap-1">
                  {pred.trend === "down" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>}
                  {pred.trend === "up" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>}
                  {pred.trend === "stable" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2.5"><path d="M5 12h14"/></svg>}
                  <span className={`text-[11px] font-medium ${pred.trend === "down" ? "text-[var(--paid)]" : pred.trend === "up" ? "text-[var(--free)]" : "text-gray-400"}`}>{pred.trendLabel}</span>
                </div>
              </div>

              {/* Hourly forecast chart */}
              <div className="bg-gray-50 dark:bg-gray-800/30 rounded-2xl p-4">
                <div className="flex gap-[2px] items-end h-12 mb-1">
                  {pred.hourlyForecast.map((v, i) => {
                    const h = Math.max(3, (v / maxForecast) * 48);
                    const isCurrent = i === nowH;
                    const pct = p.total > 0 ? v / p.total : 0;
                    const color = isCurrent ? "var(--accent)" : pct > 0.3 ? "var(--free)" : pct > 0.1 ? "var(--paid)" : "var(--full)";
                    return (
                      <div key={i} className="flex-1 rounded-sm transition-all" style={{
                        height: `${h}px`,
                        background: color,
                        opacity: isCurrent ? 1 : 0.35,
                      }} />
                    );
                  })}
                </div>
                <div className="flex justify-between">
                  <span className="text-[9px] text-gray-300 dark:text-gray-600">0h</span>
                  <span className="text-[9px] text-gray-300 dark:text-gray-600">6h</span>
                  <span className="text-[9px] text-gray-300 dark:text-gray-600">12h</span>
                  <span className="text-[9px] text-gray-300 dark:text-gray-600">18h</span>
                  <span className="text-[9px] text-gray-300 dark:text-gray-600">23h</span>
                </div>
              </div>

              {/* Best time suggestion */}
              {pred.bestTime && (
                <div className="mt-3 flex items-center gap-2 px-3 py-2.5 bg-blue-50 dark:bg-blue-900/10 rounded-xl">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  <span className="text-[12px] text-[var(--accent)] font-medium">Meilleur créneau : {pred.bestTime}</span>
                </div>
              )}
            </div>
          );
        })()}

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

        {/* === CROWD REPORTS — users signal availability === */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Communauté</span>
            </div>
            {crowdStatus && (
              <span className="text-[10px] text-gray-400">{crowdStatus.count} signalement{crowdStatus.count > 1 ? "s" : ""}</span>
            )}
          </div>
          {crowdStatus && (
            <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <span className="text-[12px] font-medium text-[var(--accent)]">{crowdStatus.status}</span>
            </div>
          )}
          {reported ? (
            <div className="text-center py-3 bg-green-50 dark:bg-green-900/10 rounded-xl">
              <span className="text-[12px] font-medium text-[var(--free)]">Merci pour votre signalement</span>
            </div>
          ) : (
            <div>
              <div className="text-[11px] text-gray-400 mb-2">Vous y êtes ? Signalez la disponibilité :</div>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => reportStatus("full")} className="py-2.5 rounded-xl bg-red-50 dark:bg-red-900/10 text-[11px] font-semibold text-red-500 active:scale-95">Complet</button>
                <button onClick={() => reportStatus("few")} className="py-2.5 rounded-xl bg-orange-50 dark:bg-orange-900/10 text-[11px] font-semibold text-orange-500 active:scale-95">Peu de places</button>
                <button onClick={() => reportStatus("many")} className="py-2.5 rounded-xl bg-green-50 dark:bg-green-900/10 text-[11px] font-semibold text-green-500 active:scale-95">Dispo</button>
              </div>
            </div>
          )}
        </div>

        {/* Voirie comparison — only in Paris */}
        {(() => {
          const comp = getVoirieComparison(p.lat, p.lng, p.pricePerHour, p.type, duration);
          if (!comp) return null;
          const vs = comp.voirieStatus;
          return (
            <div className="rounded-2xl border border-black/5 dark:border-white/5 p-4 mb-5 overflow-hidden relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2.5"><path d="M3 7h18M3 12h18M3 17h18"/></svg>
                </div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Voirie vs Parking</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-3 text-center">
                  <div className="text-[10px] text-gray-400 mb-1 font-medium">Voirie</div>
                  <div className="text-lg font-bold" style={{ color: vs.isFree ? "var(--free)" : "var(--paid)" }}>
                    {vs.isFree ? "Gratuit" : `${comp.voiriePrice.toFixed(0)}€`}
                  </div>
                  <div className="text-[9px] text-gray-400 mt-0.5">Zone {vs.zone} · {vs.reason}</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-3 text-center">
                  <div className="text-[10px] text-gray-400 mb-1 font-medium">Ce parking</div>
                  <div className="text-lg font-bold" style={{ color: p.type === "free" ? "var(--free)" : "var(--accent)" }}>
                    {p.type === "free" ? "Gratuit" : `${comp.parkingPrice.toFixed(0)}€`}
                  </div>
                  <div className="text-[9px] text-gray-400 mt-0.5">{p.type === "free" ? "Gratuit" : p.price} · Couvert</div>
                </div>
              </div>
              {comp.savings > 0.5 && (
                <div className={`text-center py-2 rounded-xl text-[12px] font-semibold ${
                  comp.cheaperOption === "parking" ? "bg-green-50 dark:bg-green-900/10 text-green-600" :
                  comp.cheaperOption === "voirie" ? "bg-yellow-50 dark:bg-yellow-900/10 text-yellow-600" :
                  "bg-gray-50 dark:bg-gray-800/40 text-gray-500"
                }`}>
                  {comp.cheaperOption === "parking" && `${comp.savings.toFixed(0)}€ moins cher en parking`}
                  {comp.cheaperOption === "voirie" && `Voirie ${comp.savings.toFixed(0)}€ moins chère (max ${vs.maxDuration}h)`}
                  {comp.cheaperOption === "equal" && "Prix similaire · Parking plus sûr"}
                </div>
              )}
              {vs.nextChange && (
                <div className="text-[10px] text-gray-400 text-center mt-2">{vs.nextChange}</div>
              )}
            </div>
          );
        })()}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button onClick={() => onNavigate?.("driving")} className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[var(--free)] text-black font-semibold text-[13px] active:scale-[0.97]"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 17h14M5 17a2 2 0 01-2-2V9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v6a2 2 0 01-2 2M5 17v2m14-2v2"/><circle cx="7.5" cy="14" r="1.5"/><circle cx="16.5" cy="14" r="1.5"/></svg> Y aller</button>
          <button onClick={() => onNavigate?.("walking")} className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[var(--accent)] text-white font-semibold text-[13px] active:scale-[0.97]"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="2"/><path d="M10 22l2-7 3 3v6"/><path d="M14 13l-3-3-2 4"/><path d="M9 14l-3 6"/></svg> À pied</button>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button onClick={onToggleFav} className={`flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-[13px] active:scale-[0.97] ${isFav ? "bg-[var(--paid-bg)] text-[var(--paid)]" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}>{isFav ? <HiBookmark size={16} /> : <HiOutlineBookmark size={16} />} {isFav ? "Sauvegardé" : "Sauvegarder"}</button>
          <button onClick={sharePark} className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium text-[13px] active:scale-[0.97]"><HiOutlineShare size={14} /> {shared ? "Copié !" : "Partager"}</button>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <button onClick={onParkHere} className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-[var(--accent)] font-medium text-[13px] active:scale-[0.97]"><HiOutlineLocationMarker size={14} /> Garé ici</button>
        </div>
      </div>
    </div>
  );
}
