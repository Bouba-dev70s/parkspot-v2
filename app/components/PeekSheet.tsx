"use client";
import { useRef, useState, useCallback } from "react";
import type { Parking } from "@/lib/api";

interface Props { parkings: Parking[]; onSelect: (p: Parking) => void; freeCount: number; paidCount: number; timestamp?: string; }

const PEEK_HEIGHT = 160; // visible height when collapsed (handle + title + stats)

export default function PeekSheet({ parkings, onSelect, freeCount, paidCount, timestamp }: Props) {
  const [expanded, setExpanded] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const dragging = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    currentY.current = e.touches[0].clientY;
    dragging.current = true;
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current || !sheetRef.current) return;
    currentY.current = e.touches[0].clientY;
    const dy = currentY.current - startY.current;

    if (expanded) {
      // Expanded: only allow dragging DOWN (to collapse)
      if (dy > 0) {
        sheetRef.current.style.transform = `translateY(${dy}px)`;
      } else {
        // Rubber band effect when trying to drag up past expanded
        sheetRef.current.style.transform = `translateY(${dy * 0.15}px)`;
      }
    } else {
      // Collapsed: allow dragging UP (to expand) or DOWN with rubber band
      const sheetH = sheetRef.current.offsetHeight;
      const maxUp = -(sheetH - PEEK_HEIGHT);
      if (dy < 0) {
        // Dragging up — expand
        const raw = (sheetH - PEEK_HEIGHT) + dy;
        sheetRef.current.style.transform = `translateY(${Math.max(maxUp, raw)}px)`;
      } else {
        // Dragging down past collapsed — RUBBER BAND, never hide
        const rubber = dy * 0.2; // heavy resistance
        sheetRef.current.style.transform = `translateY(calc(100% - ${PEEK_HEIGHT}px + ${rubber}px))`;
      }
    }
  }, [expanded]);

  const onTouchEnd = useCallback(() => {
    if (!dragging.current || !sheetRef.current) return;
    dragging.current = false;
    const dy = currentY.current - startY.current;

    // Re-enable transitions
    sheetRef.current.style.transition = "transform 0.3s cubic-bezier(0.25,0.1,0.25,1)";
    sheetRef.current.style.transform = "";

    if (expanded) {
      // If dragged down more than 80px → collapse
      setExpanded(dy > 80 ? false : true);
    } else {
      // If dragged up more than 60px → expand
      setExpanded(dy < -60 ? true : false);
    }

    startY.current = 0;
    currentY.current = 0;
  }, [expanded]);

  const toggle = () => setExpanded(e => !e);

  const ty = expanded ? "translateY(0)" : `translateY(calc(100% - ${PEEK_HEIGHT}px))`;

  return (
    <div ref={sheetRef} className="fixed left-0 right-0 z-[1000] bg-white dark:bg-[#131318] border-t border-black/8 dark:border-white/8 rounded-t-[20px] flex flex-col shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
      style={{ bottom: "74px", maxHeight: "55%", transform: ty, transition: "transform 0.3s cubic-bezier(0.25,0.1,0.25,1)", willChange: "transform" }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* Handle */}
      <div className="flex justify-center py-2.5 cursor-pointer" onClick={toggle}><div className="w-9 h-1 bg-black/15 dark:bg-white/15 rounded-full" /></div>
      {/* Title */}
      <div className="flex items-center justify-between px-5 pb-3" onClick={toggle}>
        <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">À proximité</span>
        <span className="text-xs text-gray-400">{parkings.length}</span>
      </div>
      {/* Stats */}
      <div className="flex gap-2 px-5 pb-3.5">
        <div className="flex-1 py-2.5 bg-gray-50 dark:bg-gray-800/40 rounded-xl text-center"><div className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{parkings.length}</div><div className="text-[9px] text-gray-400 uppercase tracking-widest mt-0.5 font-semibold">Parkings</div></div>
        <div className="flex-1 py-2.5 bg-gray-50 dark:bg-gray-800/40 rounded-xl text-center"><div className="text-lg font-bold tabular-nums" style={{ color: "var(--paid)" }}>{parkings.reduce((s, p) => s + p.total, 0).toLocaleString("fr-FR")}</div><div className="text-[9px] text-gray-400 uppercase tracking-widest mt-0.5 font-semibold">Places</div></div>
        <div className="flex-1 py-2.5 bg-gray-50 dark:bg-gray-800/40 rounded-xl text-center"><div className="text-lg font-bold tabular-nums" style={{ color: "var(--accent)" }}>{parkings.filter(p => p.realtime).length}</div><div className="text-[9px] text-gray-400 uppercase tracking-widest mt-0.5 font-semibold">Temps réel</div></div>
      </div>
      {/* Parking list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
        {parkings.slice(0, 30).map((p) => {
          const est = !p.realtime;
          const r = p.total > 0 ? p.avail / p.total : 0;
          const ac = r > 0.3 ? "text-[var(--free)]" : r > 0 ? "text-[var(--paid)]" : "text-[var(--full)]";
          const ic = p.avail === 0 ? "bg-[var(--full)] opacity-50" : p.type === "free" ? "bg-[var(--free)]" : "bg-[var(--paid)]";
          return (
            <button key={p.id} onClick={() => onSelect(p)} className="w-full flex items-center gap-3 p-3 bg-white dark:bg-gray-800/20 border border-gray-100 dark:border-white/5 rounded-xl mb-1.5 text-left active:bg-gray-50 dark:active:bg-gray-700/50">
              <div className={`w-[3px] h-10 rounded-full ${ic}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold truncate text-gray-900 dark:text-white">{p.name}</span>
                  {p.realtime && <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
                </div>
                <div className="text-[11px] text-gray-400 truncate mt-0.5">{p.addr}</div>
              </div>
              <div className="text-right shrink-0 pl-2">
                <div className={`text-base font-bold tabular-nums ${ac}`}>{est ? "~" : ""}{p.avail}</div>
                <div className={`mt-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-wide ${p.type === "free" ? "bg-[var(--free-bg)] text-[var(--free)]" : "bg-[var(--paid-bg)] text-[var(--paid)]"}`}>{p.type === "free" ? "GRATUIT" : p.price}</div>
              </div>
            </button>);
        })}
      </div>
    </div>
  );
}
