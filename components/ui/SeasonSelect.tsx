"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import FocusElementProvider from "../providers/FocusElementProvider";
import type { Season } from "@/types/movie";

interface SeasonSelectProps {
  seasons: Season[];
  activeSeason: string;
  onChange: (season: string) => void;
}

export default function SeasonSelect({
  seasons,
  activeSeason,
  onChange,
}: SeasonSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (season: string) => {
    onChange(season);
    setIsOpen(false);
  };

  return (
    <div
      className="relative inline-block w-full sm:w-auto min-w-[220px]"
      ref={containerRef}
    >
      {/* Trigger Button */}
      <FocusElementProvider
        className="rounded-xl w-full"
        onEnterPress={() => setIsOpen((prev) => !prev)}
        strokeSize={0}
        styleFocus={{
          outline: "2px solid #e50914",
          outlineOffset: "2px",
        }}
      >
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className="w-full flex items-center justify-between bg-[#131519] hover:bg-[#1a1d24] border border-white/10 text-white text-base font-semibold px-5 py-3 rounded-xl transition-all cursor-pointer shadow-lg"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span className="font-poppins tracking-wide">
            Temporada {activeSeason}
          </span>
          <ChevronDown
            className={`text-gray-300 transition-transform duration-300 ml-3 ${
              isOpen ? "rotate-180 text-white" : ""
            }`}
            size={20}
          />
        </button>
      </FocusElementProvider>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-[#16181f] border border-white/15 rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.9)] p-1.5 flex flex-col gap-1 max-h-72 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
          {seasons.map((s) => {
            const isSelected = s.season === activeSeason;
            return (
              <button
                key={s.season}
                onClick={() => handleSelect(s.season)}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium transition-colors text-left cursor-pointer ${
                  isSelected
                    ? "bg-[#e50914] text-white font-bold shadow-md"
                    : "text-gray-300 hover:bg-white/[0.08] hover:text-white"
                }`}
                role="option"
                aria-selected={isSelected}
              >
                <span>Temporada {s.season}</span>
                {isSelected && <Check size={16} strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
