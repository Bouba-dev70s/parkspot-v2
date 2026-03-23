"use client";
import { useState, useRef, useCallback } from "react";

interface Props {
  onComplete: () => void;
}

const screens = [
  {
    title: "Trouvez votre\nparking",
    subtitle: "Localisez les parkings disponibles autour de vous en temps réel, dans 4 grandes villes de France.",
    color: "#16a34a",
    illustration: "search",
  },
  {
    title: "Comparez les\ntarifs",
    subtitle: "Voirie ou parking souterrain ? ParkSpot compare les prix et vous indique l'option la moins chère.",
    color: "#2563eb",
    illustration: "compare",
  },
  {
    title: "Laissez-vous\nguider",
    subtitle: "Navigation intégrée avec guidage vocal jusqu'à votre place. Plus besoin de changer d'app.",
    color: "#8b5cf6",
    illustration: "navigate",
  },
];

function Illustration({ type, color }: { type: string; color: string }) {
  switch (type) {
    case "search":
      return (
        <div className="relative w-56 h-56 mx-auto">
          {/* Map background */}
          <div className="absolute inset-4 rounded-3xl opacity-10" style={{ background: color }} />
          {/* Pin */}
          <svg className="absolute top-6 left-1/2 -translate-x-1/2" width="64" height="64" viewBox="0 0 24 24" fill="none">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5"/>
            <circle cx="12" cy="10" r="3" fill={color}/>
          </svg>
          {/* Parking markers */}
          <div className="absolute top-20 left-8 w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-lg" style={{ background: "#16a34a" }}>5</div>
          <div className="absolute top-28 right-10 w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-lg" style={{ background: "#ea580c" }}>12</div>
          <div className="absolute bottom-16 left-16 w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-lg" style={{ background: "#16a34a" }}>3</div>
          <div className="absolute bottom-24 right-16 w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-lg opacity-50" style={{ background: "#dc2626" }}>0</div>
          {/* Search bar */}
          <div className="absolute bottom-4 left-4 right-4 h-10 bg-white dark:bg-[#1c1c24] rounded-xl shadow-md flex items-center px-3 gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <div className="h-2 w-24 bg-gray-200 dark:bg-gray-700 rounded-full" />
          </div>
        </div>
      );
    case "compare":
      return (
        <div className="relative w-56 h-56 mx-auto">
          {/* Two cards */}
          <div className="absolute top-6 left-2 right-2">
            <div className="bg-white dark:bg-[#1c1c24] rounded-2xl p-4 shadow-md mb-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-gray-400 font-medium mb-0.5">Voirie · Zone 1</div>
                  <div className="text-[18px] font-bold" style={{ color: "#ea580c" }}>6€<span className="text-[11px] font-normal text-gray-400">/h</span></div>
                </div>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#ea580c15" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2"><path d="M3 7h18M3 12h18M3 17h18"/></svg>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-[#1c1c24] rounded-2xl p-4 shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-gray-400 font-medium mb-0.5">Parking souterrain</div>
                  <div className="text-[18px] font-bold" style={{ color: "#16a34a" }}>3.50€<span className="text-[11px] font-normal text-gray-400">/h</span></div>
                </div>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#16a34a15" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M3 8l9-5 9 5"/></svg>
                </div>
              </div>
            </div>
          </div>
          {/* Savings badge */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-green-50 dark:bg-green-900/20 text-green-600 px-4 py-2 rounded-full text-[12px] font-semibold shadow-sm">
            2.50€ économisés
          </div>
        </div>
      );
    case "navigate":
      return (
        <div className="relative w-56 h-56 mx-auto">
          {/* Route line */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 224 224" fill="none">
            <path d="M40 200 Q60 120 112 100 Q164 80 184 30" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray="0" opacity="0.3"/>
            <path d="M40 200 Q60 120 112 100 Q164 80 184 30" stroke={color} strokeWidth="4" strokeLinecap="round"/>
          </svg>
          {/* Start dot */}
          <div className="absolute bottom-5 left-6 w-4 h-4 rounded-full border-[3px] border-white shadow-md" style={{ background: color }} />
          {/* End pin */}
          <svg className="absolute top-3 right-6" width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" fill={color} stroke="white" strokeWidth="1.5"/>
            <circle cx="12" cy="10" r="3" fill="white"/>
          </svg>
          {/* Instruction card */}
          <div className="absolute top-16 left-3 right-3 bg-[#1c1c1e] rounded-xl p-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </div>
              <div>
                <div className="text-white text-[12px] font-semibold">Tourner à droite</div>
                <div className="text-white/40 text-[10px]">sur Rue de Rivoli</div>
              </div>
            </div>
          </div>
          {/* ETA card */}
          <div className="absolute bottom-12 left-3 right-3 bg-white dark:bg-[#1c1c24] rounded-xl p-3 shadow-lg flex items-center justify-between">
            <div>
              <div className="text-[16px] font-bold text-gray-900 dark:text-white">14:23</div>
              <div className="text-[9px] text-gray-400">1.2 km · 4 min</div>
            </div>
            <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
}

export default function Onboarding({ onComplete }: Props) {
  const [page, setPage] = useState(0);
  const touchStart = useRef(0);
  const touchEnd = useRef(0);

  const next = () => {
    if (page < screens.length - 1) setPage(page + 1);
    else finish();
  };

  const finish = () => {
    localStorage.setItem("parkspot_onboarded", "1");
    onComplete();
  };

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
    touchEnd.current = e.touches[0].clientX;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    touchEnd.current = e.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback(() => {
    const diff = touchStart.current - touchEnd.current;
    if (diff > 60 && page < screens.length - 1) setPage(page + 1);
    if (diff < -60 && page > 0) setPage(page - 1);
  }, [page]);

  const s = screens[page];

  return (
    <div
      className="fixed inset-0 z-[9999] bg-white dark:bg-[#0e0e12] flex flex-col"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Skip */}
      <div className="flex justify-end px-6" style={{ paddingTop: 64 }}>
        {page < screens.length - 1 && (
          <button onClick={finish} className="text-[13px] text-gray-400 font-medium active:opacity-50">
            Passer
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-10">
        {/* Illustration */}
        <div className="mb-10" style={{ transition: "opacity 0.3s" }} key={page}>
          <Illustration type={s.illustration} color={s.color} />
        </div>

        {/* Title */}
        <h1 className="text-[32px] font-bold text-center leading-[1.15] tracking-tight text-gray-900 dark:text-white mb-4 whitespace-pre-line">
          {s.title}
        </h1>

        {/* Subtitle */}
        <p className="text-[16px] text-gray-400 text-center leading-relaxed max-w-[280px]">
          {s.subtitle}
        </p>
      </div>

      {/* Bottom — dots + button */}
      <div className="px-8 pb-12">
        {/* Dots */}
        <div className="flex justify-center gap-2 mb-8">
          {screens.map((_, i) => (
            <div
              key={i}
              className="h-[6px] rounded-full transition-all duration-300"
              style={{
                width: i === page ? 24 : 6,
                background: i === page ? s.color : "rgba(150,150,150,0.2)",
              }}
            />
          ))}
        </div>

        {/* Button */}
        <button
          onClick={next}
          className="w-full py-4 rounded-2xl font-semibold text-[16px] text-white active:scale-[0.97] transition-all"
          style={{ background: s.color }}
        >
          {page === screens.length - 1 ? "C'est parti" : "Continuer"}
        </button>
      </div>
    </div>
  );
}
