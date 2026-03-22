"use client";
import { HiOutlineMap, HiOutlineSearch, HiOutlineBookmark, HiOutlineUser } from "react-icons/hi";

const tabs = [
  { id: "map", label: "Carte", icon: HiOutlineMap },
  { id: "list", label: "Explorer", icon: HiOutlineSearch },
  { id: "fav", label: "Favoris", icon: HiOutlineBookmark },
  { id: "profile", label: "Profil", icon: HiOutlineUser },
] as const;

export type TabId = (typeof tabs)[number]["id"];

interface Props {
  active: TabId;
  onChange: (tab: TabId) => void;
}

export default function TabBar({ active, onChange }: Props) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[2000] bg-white dark:bg-[#0e0e12] border-t border-black/8 dark:border-white/8 flex safe-bottom">
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onTouchStart={(e) => { e.preventDefault(); onChange(t.id); }}
            onClick={() => onChange(t.id)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[52px] pt-1 
              ${isActive ? "text-[var(--free)]" : "text-black/30 dark:text-white/30"}`}
          >
            <Icon size={22} />
            <span className="text-[10px] font-medium tracking-wide">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
