"use client";
import { useRef, useState, useCallback } from "react";
import type { Parking } from "@/lib/api";

interface Props {
  parkings: Parking[];
  onSelect: (p: Parking) => void;
  freeCount: number;
  paidCount: number;
}

export default function PeekSheet({ parkings, onSelect, freeCount, paidCount }: Props) {
  const [state, setState] = useState<"expanded" | "collapsed" | "hidden">("collapsed");
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const dragging = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    dragging.current = true;
    sheetRef.current?.classList.add("sheet-dragging");
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current || !sheetRef.current) return;
    currentY.current = e.touches[0].clientY;
    const dy = currentY.current - startY.current;
    if (state === "collapsed") {
      const base = sheetRef.current.offsetHeight - 140;
      sheetRef.current.style.transform = `translateY(${Math.max(-base, base + dy)}px)`;
    } else if (state === "expanded" && dy > 0) {
      sheetRef.current.style.transform = `translateY(${dy}px)`;
    }
  }, [state]);

  const onTouchEnd = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    sheetRef.current?.classList.remove("sheet-dragging");
    const dy = currentY.current - startY.current;
    if (state === "expanded") {
      setState(dy > 80 ? (dy > 200 ? "hidden" : "collapsed") : "expanded");
    } else if (state === "collapsed") {
      setState(dy < -60 ? "expanded" : dy > 60 ? "hidden" : "collapsed");
    }
    if (sheetRef.current) sheetRef.current.style.transform = "";
    startY.current = 0;
    currentY.current = 0;
  }, [state]);

  const toggle = () => {
    setState((s) => (s === "expanded" ? "collapsed" : s === "collapsed" ? "expanded" : "collapsed"));
  };

  const translateY = state === "collapsed" ? "translateY(calc(100% - 140px))" : state === "hidden" ? "translateY(100%)" : "translateY(0)";

  const pct = (p: Parking) => (p.total > 0 ? p.avail / p.total : 0);

  return (
    <div
      ref={sheetRef}
      className="fixed left-0 right-0 z-[1000] bg-white dark:bg-[#131318] border-t border-black/8 dark:border-white/8 rounded-t-[20px] flex flex-col shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
      style={{ bottom: "calc(60px + max(8px, env(safe-area-inset-bottom, 8px)))", maxHeight: "55%", transform: translateY, transition: "transform 0.3s cubic-bezier(0.25,0.1,0.25,1)", willChange: "transform" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Handle */}
      <div className="flex justify-center py-2.5 cursor-pointer" onClick={toggle}>
        <div className="w-9 h-1 bg-black/15 dark:bg-white/15 rounded-full" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-5 pb-3" onClick={toggle}>
        <span className="text-lg font-bold tracking-tight">A proximite</span>
        <span className="font-mono text-xs text-black/30 dark:text-white/30">{parkings.length} spots</span>
      </div>

      {/* Stats */}
      <div className="flex gap-2 px-5 pb-3.5">
        <div className="flex-1 p-2.5 bg-gray-100 dark:bg-gray-800/50 rounded-xl text-center">
          <div className="font-mono text-xl font-bold" style={{ color: "var(--free)" }}>{freeCount}</div>
          <div className="text-[10px] text-black/30 dark:text-white/30 uppercase tracking-wide mt-0.5">Gratuit</div>
        </div>
        <div className="flex-1 p-2.5 bg-gray-100 dark:bg-gray-800/50 rounded-xl text-center">
          <div className="font-mono text-xl font-bold" style={{ color: "var(--paid)" }}>{paidCount}</div>
          <div className="text-[10px] text-black/30 dark:text-white/30 uppercase tracking-wide mt-0.5">Payant</div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
        {parkings.slice(0, 30).map((p) => {
          const r = pct(p);
          const ac = r > 0.3 ? "text-[var(--free)]" : r > 0 ? "text-[var(--paid)]" : "text-[var(--full)]";
          const ic = p.avail === 0 ? "bg-[var(--full)] opacity-50" : p.type === "free" ? "bg-[var(--free)]" : "bg-[var(--paid)]";
          return (
            <button key={p.id} onClick={() => onSelect(p)} className="w-full flex items-center gap-3.5 p-3.5 bg-gray-100 dark:bg-gray-800/50 border border-black/5 dark:border-white/5 rounded-[14px] mb-2 text-left active:bg-black/5 dark:active:bg-white/5">
              <div className={`w-1 h-10 rounded ${ic}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{p.name}</div>
                <div className="text-xs text-black/30 dark:text-white/30 truncate mt-0.5">{p.addr}</div>
              </div>
              <div className="text-right shrink-0">
                <div className={`font-mono text-lg font-semibold ${ac}`}>{p.avail}</div>
                <div className="text-[10px] text-black/30 dark:text-white/30">/ {p.total}</div>
                <div className={`inline-block mt-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${p.type === "free" ? "bg-[var(--free-bg)] text-[var(--free)]" : "bg-[var(--paid-bg)] text-[var(--paid)]"}`}>
                  {p.type === "free" ? "GRATUIT" : p.price}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
