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
    <nav className="fixed inset-x-0 bottom-0 z-[2000] bg-white dark:bg-[#0e0e12] border-t border-black/8 dark:border-white/8">
      <div className="flex">
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onTouchStart={(e) => { e.preventDefault(); onChange(t.id); }}
            onClick={() => onChange(t.id)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-[50px]
              ${isActive ? "text-[var(--free)]" : "text-black/30 dark:text-white/30"}`}
          >
            <Icon size={22} />
            <span className="text-[10px] font-medium tracking-wide">{t.label}</span>
          </button>
        );
      })}
      </div>
      <div className="h-[16px]" />
    </nav>
  );
}
