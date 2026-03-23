"use client";
import { useState, useEffect, useRef, useCallback } from "react";
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

  // Voice init
  useEffect(() => {
    setVoiceEnabled(voiceOn);
    if (voiceOn && route.steps[0]) {
      speak(`Navigation démarrée. ${route.steps[0].instruction}. Durée estimée ${formatDuration(route.duration)}.`, true);
    }
  }, []);

  // === UPDATE POSITION → navigation state ===
  useEffect(() => {
    if (!userPos || arrived) return;

    const [lat, lng] = userPos;

    // Check arrival (within 30m of destination)
    const distToDest = distanceMeters(lat, lng, destination.lat, destination.lng);
    if (distToDest < 30) {
      setArrived(true);
      speak("Vous êtes arrivé à destination.", true);
      return;
    }

    // Find current position on route
    const { distance: distFromRoute } = closestPointOnRoute(lat, lng, route.geometry);
    const offRoute = distFromRoute > OFF_ROUTE_THRESHOLD;
    setIsOffRoute(offRoute);

    // Recalculate route if off-route (max once per 10s)
    if (offRoute && Date.now() - lastRecalc.current > 10000) {
      lastRecalc.current = Date.now();
      speak("Recalcul de l'itinéraire");
      calculateRoute(lat, lng, destination.lat, destination.lng, mode).then((newRoute) => {
        if (newRoute) {
          onUpdateRoute(newRoute);
          setCurrentStep(0);
          speak(newRoute.steps[0]?.instruction || "Continuer");
        }
      });
      return;
    }

    if (!offRoute) {
      const nav = findCurrentStep(lat, lng, route);
      setCurrentStep(nav.stepIndex);
      setDistToNext(nav.distanceToNext);
      setDistRemaining(nav.distanceRemaining);
      setDurRemaining(nav.durationRemaining);

      // Voice guidance for next step
      const nextStep = route.steps[nav.stepIndex + 1];
      if (nextStep) {
        const voiceText = getVoiceInstruction(nextStep, nav.distanceToNext);
        if (voiceText) speak(voiceText);
      }
    }
  }, [userPos]);

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    setVoiceEnabled(next);
    if (next) speak("Guidage vocal activé", true);
  };

  const step = route.steps[currentStep];
  const nextStep = route.steps[currentStep + 1];
  const eta = formatETA(durRemaining);
  const modeIcon = mode === "walking" ? "🚶" : "🚗";
  const modeColor = mode === "walking" ? "#2563eb" : "#16a34a";

  // === ARRIVED SCREEN ===
  if (arrived) return (
    <div className="fixed inset-x-0 bottom-0 z-[2500] bg-white dark:bg-[#131318] rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.15)] px-6 py-8 text-center">
      <div className="text-5xl mb-4">📍</div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Vous êtes arrivé !</h2>
      <p className="text-gray-400 mb-6">{destination.name}</p>
      <button onClick={onClose} className="w-full py-4 rounded-2xl bg-[var(--free)] text-black font-bold text-lg active:scale-[0.97]">Terminer</button>
    </div>
  );

  return (
    <>
      {/* TOP BAR — next instruction (large) */}
      <div className="fixed top-0 inset-x-0 z-[2500]" style={{ paddingTop: 59 }}>
        <div className="mx-3 rounded-2xl shadow-lg overflow-hidden" style={{ background: modeColor }}>
          {/* Off-route warning */}
          {isOffRoute && (
            <div className="bg-red-500 text-white text-center py-1.5 text-[12px] font-semibold">
              ⚠️ Hors itinéraire · Recalcul en cours...
            </div>
          )}
          
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="text-4xl">{nextStep?.icon || step?.icon || "⬆️"}</div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-[15px] font-bold leading-tight">{nextStep?.instruction || step?.instruction || "Continuer"}</div>
              {nextStep && <div className="text-white/70 text-[12px] mt-1">{formatDistance(distToNext)}</div>}
            </div>
          </div>

          {/* After that */}
          {route.steps[currentStep + 2] && (
            <div className="px-5 py-2 bg-black/10 flex items-center gap-3">
              <span className="text-lg">{route.steps[currentStep + 2].icon}</span>
              <span className="text-white/80 text-[12px]">Puis {route.steps[currentStep + 2].instruction.toLowerCase()}</span>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM BAR — ETA, distance, controls */}
      <div className="fixed inset-x-0 bottom-0 z-[2500] bg-white dark:bg-[#131318] border-t border-black/8 dark:border-white/8 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]" style={{ paddingBottom: 34 }}>
        {/* Progress bar */}
        <div className="h-1 bg-gray-100 dark:bg-gray-800">
          <div className="h-full rounded-full" style={{ width: `${Math.max(2, ((route.distance - distRemaining) / route.distance) * 100)}%`, background: modeColor, transition: "width 1s" }} />
        </div>

        <div className="px-5 py-4 flex items-center justify-between">
          {/* ETA & distance */}
          <div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{eta}</div>
            <div className="text-[12px] text-gray-400 mt-0.5">
              {formatDistance(distRemaining)} · {formatDuration(durRemaining)} {modeIcon}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Voice toggle */}
            <button onClick={toggleVoice} className={`w-11 h-11 rounded-full flex items-center justify-center active:scale-90 ${voiceOn ? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-300"}`}>
              {voiceOn ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
              )}
            </button>
            
            {/* Center on me */}
            <button onClick={onCenterUser} className="w-11 h-11 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[var(--accent)] active:scale-90">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>
            </button>

            {/* Steps list */}
            <button onClick={() => setShowAllSteps(!showAllSteps)} className="w-11 h-11 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-white active:scale-90">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>

            {/* Stop */}
            <button onClick={onClose} className="w-11 h-11 rounded-full bg-red-500 flex items-center justify-center text-white active:scale-90">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            </button>
          </div>
        </div>

        {/* Destination */}
        <div className="px-5 pb-3 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: modeColor }} />
          <span className="text-[12px] text-gray-400 truncate">{destination.name}</span>
        </div>
      </div>

      {/* ALL STEPS PANEL (overlay) */}
      {showAllSteps && (
        <div className="fixed inset-0 z-[2600] bg-white dark:bg-[#0e0e12]" style={{ paddingTop: 59 }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Itinéraire</h2>
            <button onClick={() => setShowAllSteps(false)} className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400">✕</button>
          </div>
          <div className="overflow-y-auto px-5 py-3" style={{ height: "calc(100% - 130px)" }}>
            {route.steps.map((s, i) => (
              <div key={i} className={`flex items-start gap-4 py-3 ${i < route.steps.length - 1 ? "border-b border-black/5 dark:border-white/5" : ""} ${i === currentStep ? "opacity-100" : i < currentStep ? "opacity-30" : "opacity-70"}`}>
                <div className="text-2xl mt-0.5">{s.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] font-semibold ${i === currentStep ? "text-[var(--accent)]" : "text-gray-900 dark:text-white"}`}>{s.instruction}</div>
                  {s.name && <div className="text-[12px] text-gray-400 mt-0.5">{s.name}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[12px] font-semibold text-gray-500">{formatDistance(s.distance)}</div>
                  <div className="text-[10px] text-gray-400">{formatDuration(s.duration)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-black/5 dark:border-white/5 flex justify-between">
            <span className="text-[13px] font-semibold text-gray-900 dark:text-white">Total : {formatDistance(route.distance)}</span>
            <span className="text-[13px] text-gray-400">{formatDuration(route.duration)}</span>
          </div>
        </div>
      )}
    </>
  );
}
