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

  // Cierra el menú al hacer clic afuera (mouse users)
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
      {/* Botón Trigger */}
      <FocusElementProvider
        className="rounded"
        onEnterPress={() => setIsOpen((prev) => !prev)}
      >
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className="w-full flex items-center justify-between bg-[#242424] hover:bg-[#333333] text-white text-base md:text-lg font-medium px-4 py-3.5 md:py-2.5 transition-colors cursor-pointer rounded outline-none"
        >
          <span>Season {activeSeason}</span>
          <ChevronDown
            className={`text-white transition-transform duration-300 ml-4 ${
              isOpen ? "rotate-180" : ""
            }`}
            size={22}
          />
        </button>
      </FocusElementProvider>

      {/* Menú Dropdown */}
      {isOpen && (
        <>
          <style>{`
            @keyframes dropdownSlide {
              from { opacity: 0; transform: translateY(-4px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-dropdown {
              animation: dropdownSlide 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
          `}</style>
          <div className="absolute z-50 w-full mt-2 py-2 bg-[#181818] border border-white/10 rounded shadow-2xl overflow-hidden max-h-[50vh] overflow-y-auto animate-dropdown custom-scrollbar">
            {seasons.map((s) => {
              const isActive = activeSeason === s.season;
              return (
                <FocusElementProvider
                  key={s.season}
                  className="rounded-none"
                  strokeSize={0}
                  styleFocus={{ background: "rgba(0,0,0,0.4)" }}
                  onEnterPress={() => handleSelect(s.season)}
                >
                  <button
                    onClick={() => handleSelect(s.season)}
                    className={`w-full flex items-center justify-between px-4 py-3.5 md:py-2.5 text-base md:text-lg transition-colors cursor-pointer outline-none ${
                      isActive
                        ? "text-white font-semibold bg-white/5"
                        : "text-[#b3b3b3] hover:text-white hover:bg-[#333333]"
                    }`}
                  >
                    <span>Season {s.season}</span>
                    {isActive && <Check size={20} className="text-white" />}
                  </button>
                </FocusElementProvider>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
