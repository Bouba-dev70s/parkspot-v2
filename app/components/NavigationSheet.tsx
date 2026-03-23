"use client";
import { useState, useEffect, useRef } from "react";
import type { Route, RouteStep } from "@/lib/navigation";
import { formatDistance, formatDuration, formatETA, findCurrentStep, distanceMeters, closestPointOnRoute, speak, getVoiceInstruction, setVoiceEnabled, isVoiceEnabled, OFF_ROUTE_THRESHOLD, calculateRoute } from "@/lib/navigation";

interface Props {
  route: Route;
  userPos: [number, number] | null;
  destination: { name: string; lat: number; lng: number };
  onClose: () => void;
  onUpdateRoute: (route: Route) => void;
  onCenterUser: () => void;
  mode: "driving" | "walking";
}

function DirectionIcon({ type, size = 32, color = "#fff" }: { type: string; size?: number; color?: string }) {
  const s = size;
  const sw = 2.5;
  switch (type) {
    case "left":
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>;
    case "right":
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>;
    case "sharp-left":
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M18 20L6 8"/><path d="M6 14V8h6"/></svg>;
    case "sharp-right":
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M6 20l12-12"/><path d="M12 8h6v6"/></svg>;
    case "slight-left":
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M14 20L8 8"/><path d="M8 14V8h6"/></svg>;
    case "slight-right":
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M10 20l6-12"/><path d="M10 8h6v6"/></svg>;
    case "roundabout":
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="10" r="4"/><path d="M12 14v6"/><path d="M16 10l2-2"/></svg>;
    case "merge":
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M8 6l4 6 4-6"/><path d="M12 12v8"/></svg>;
    case "arrive":
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>;
    case "depart":
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>;
    case "straight":
    default:
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>;
  }
}

export default function NavigationSheet({ route, userPos, destination, onClose, onUpdateRoute, onCenterUser, mode }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [distToNext, setDistToNext] = useState(0);
  const [distRemaining, setDistRemaining] = useState(route.distance);
  const [durRemaining, setDurRemaining] = useState(route.duration);
  const [isOffRoute, setIsOffRoute] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [arrived, setArrived] = useState(false);
  const lastRecalc = useRef(0);

  useEffect(() => {
    setVoiceEnabled(voiceOn);
    // Preload voices (Safari needs this trigger)
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
    // Delay first speak to let voices load
    const t = setTimeout(() => {
      if (voiceOn && route.steps[0]) {
        speak(`Navigation démarrée. ${route.steps[0].instruction}. Durée estimée ${formatDuration(route.duration)}.`, true);
      }
    }, 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!userPos || arrived) return;
    const [lat, lng] = userPos;
    const distToDest = distanceMeters(lat, lng, destination.lat, destination.lng);
    if (distToDest < 30) { setArrived(true); speak("Vous êtes arrivé à destination.", true); return; }
    const { distance: distFromRoute } = closestPointOnRoute(lat, lng, route.geometry);
    const offRoute = distFromRoute > OFF_ROUTE_THRESHOLD;
    setIsOffRoute(offRoute);
    if (offRoute && Date.now() - lastRecalc.current > 10000) {
      lastRecalc.current = Date.now();
      speak("Recalcul de l'itinéraire");
      calculateRoute(lat, lng, destination.lat, destination.lng, mode).then((r) => {
        if (r) { onUpdateRoute(r); setCurrentStep(0); speak(r.steps[0]?.instruction || "Continuer"); }
      });
      return;
    }
    if (!offRoute) {
      const nav = findCurrentStep(lat, lng, route);
      setCurrentStep(nav.stepIndex);
      setDistToNext(nav.distanceToNext);
      setDistRemaining(nav.distanceRemaining);
      setDurRemaining(nav.durationRemaining);
      const ns = route.steps[nav.stepIndex + 1];
      if (ns) { const v = getVoiceInstruction(ns, nav.distanceToNext); if (v) speak(v); }
    }
  }, [userPos]);

  const toggleVoice = () => { const n = !voiceOn; setVoiceOn(n); setVoiceEnabled(n); if (n) speak("Guidage vocal activé", true); };
  const step = route.steps[currentStep];
  const nextStep = route.steps[currentStep + 1];
  const eta = formatETA(durRemaining);

  if (arrived) return (
    <div className="fixed inset-x-0 bottom-0 z-[2500] bg-white dark:bg-[#131318] rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.15)]" style={{ paddingBottom: 34 }}>
      <div className="px-6 py-8 text-center">
        <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
          <DirectionIcon type="arrive" size={28} color="#16a34a" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Vous êtes arrivé</h2>
        <p className="text-[13px] text-gray-400 mb-6">{destination.name}</p>
        <button onClick={onClose} className="w-full py-4 rounded-2xl bg-[var(--free)] text-black font-bold text-[15px] active:scale-[0.97]">Terminer</button>
      </div>
    </div>
  );

  return (
    <>
      {/* TOP — Instruction */}
      <div className="fixed top-0 inset-x-0 z-[2500]" style={{ paddingTop: 59 }}>
        <div className="mx-3 rounded-2xl shadow-lg overflow-hidden bg-[#1c1c1e]">
          {isOffRoute && <div className="bg-red-500 text-white text-center py-1.5 text-[11px] font-semibold tracking-wide">RECALCUL EN COURS</div>}
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <DirectionIcon type={nextStep?.icon || step?.icon || "straight"} size={28} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-[16px] font-semibold leading-snug">{nextStep?.instruction || step?.instruction || "Continuer"}</div>
              {nextStep && <div className="text-white/50 text-[13px] mt-1 font-medium">{formatDistance(distToNext)}</div>}
            </div>
          </div>
          {route.steps[currentStep + 2] && (
            <div className="px-5 py-2.5 bg-white/5 flex items-center gap-3 border-t border-white/5">
              <div className="w-6 h-6 flex items-center justify-center opacity-40">
                <DirectionIcon type={route.steps[currentStep + 2].icon} size={16} />
              </div>
              <span className="text-white/40 text-[12px]">Puis {route.steps[currentStep + 2].instruction.toLowerCase()}</span>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM — ETA + controls */}
      <div className="fixed inset-x-0 bottom-0 z-[2500] bg-white dark:bg-[#1c1c1e] rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.12)]" style={{ paddingBottom: 34 }}>
        <div className="h-[3px] bg-gray-100 dark:bg-white/5">
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(2, ((route.distance - distRemaining) / route.distance) * 100)}%`, transition: "width 1s" }} />
        </div>
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-[28px] font-bold text-gray-900 dark:text-white tracking-tight">{eta}</div>
            <div className="text-[13px] text-gray-400 mt-0.5 font-medium">{formatDistance(distRemaining)} · {formatDuration(durRemaining)}</div>
          </div>
          <div className="flex items-center gap-2.5">
            <button onClick={toggleVoice} className={`w-10 h-10 rounded-full flex items-center justify-center ${voiceOn ? "bg-gray-100 dark:bg-white/10" : "bg-gray-100 dark:bg-white/5"}`}>
              {voiceOn ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-700 dark:text-white"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 dark:text-gray-500"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>}
            </button>
            <button onClick={onCenterUser} className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--accent)]"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>
            </button>
            <button onClick={() => setShowAllSteps(true)} className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-700 dark:text-white"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>
            </button>
            <button onClick={onClose} className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center active:scale-90">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            </button>
          </div>
        </div>
        <div className="px-5 pb-2 flex items-center gap-2.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span className="text-[12px] text-gray-400 truncate">{destination.name}</span>
        </div>
      </div>

      {/* STEPS LIST */}
      {showAllSteps && (
        <div className="fixed inset-0 z-[2600] bg-white dark:bg-[#0e0e12]" style={{ paddingTop: 59 }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Itinéraire détaillé</h2>
            <button onClick={() => setShowAllSteps(false)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-400"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-2" style={{ height: "calc(100% - 140px)" }}>
            {route.steps.map((s, i) => (
              <div key={i} className={`flex items-center gap-4 py-3.5 ${i < route.steps.length - 1 ? "border-b border-black/5 dark:border-white/5" : ""} ${i < currentStep ? "opacity-25" : i === currentStep ? "opacity-100" : "opacity-60"}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${i === currentStep ? "bg-[var(--accent)]" : "bg-gray-100 dark:bg-white/5"}`}>
                  <DirectionIcon type={s.icon} size={20} color={i === currentStep ? "#fff" : "#999"} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] font-medium ${i === currentStep ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-300"}`}>{s.instruction}</div>
                  {s.name && <div className="text-[11px] text-gray-400 mt-0.5">{s.name}</div>}
                </div>
                <div className="text-[12px] font-semibold text-gray-400 shrink-0 pl-2">{formatDistance(s.distance)}</div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-black/5 dark:border-white/5 flex justify-between">
            <span className="text-[13px] font-semibold text-gray-900 dark:text-white">{formatDistance(route.distance)}</span>
            <span className="text-[13px] text-gray-400">{formatDuration(route.duration)}</span>
          </div>
        </div>
      )}
    </>
  );
}
