"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, Loader2, ArrowLeft } from "lucide-react";
import FocusElementProvider from "../providers/FocusElementProvider";

interface NetflixSearchProps {
  className?: string;
  isMobile?: boolean;
}

export default function NetflixSearch({ className = "" }: NetflixSearchProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get("search") ?? "";

  const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isDesktopOpen, setIsDesktopOpen] = useState(Boolean(urlSearch));
  const [pending, setPending] = useState(false);
  const [value, setValue] = useState(urlSearch);

  // Sync state during render when URL query changes (avoids effect cascading render)
  if (urlSearch !== prevUrlSearch) {
    setPrevUrlSearch(urlSearch);
    setValue(urlSearch);
    if (urlSearch) {
      setIsDesktopOpen(true);
    }
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const desktopContainerRef = useRef<HTMLDivElement>(null);

  // Click outside to collapse desktop search if empty (classic Netflix behavior)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (!document.contains(target)) return;

      if (
        desktopContainerRef.current &&
        !desktopContainerRef.current.contains(target)
      ) {
        if (!value) {
          setIsDesktopOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value]);

  const DEBOUNCE_MS = 1000;

  function triggerSearch(val: string) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    setPending(false);
    const trimmed = val.trim();
    if (trimmed === "") {
      router.push("/");
    } else {
      router.push(`/?search=${encodeURIComponent(trimmed)}`);
    }
  }

  function handleSearch(val: string) {
    setValue(val);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const trimmed = val.trim();
    if (trimmed === "") {
      setPending(false);
      router.push("/");
      return;
    }

    setPending(true);
    debounceRef.current = setTimeout(() => {
      triggerSearch(val);
    }, DEBOUNCE_MS);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      triggerSearch(value);
    }
  }

  function handleClear() {
    setValue("");
    setPending(false);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    router.push("/");
    desktopInputRef.current?.focus();
    mobileInputRef.current?.focus();
  }

  function toggleDesktop() {
    setIsDesktopOpen((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => desktopInputRef.current?.focus(), 80);
      }
      return next;
    });
  }

  function openMobileSearch() {
    setIsMobileOpen(true);
    setTimeout(() => {
      mobileInputRef.current?.focus();
    }, 80);
  }

  function closeMobileSearch() {
    setIsMobileOpen(false);
  }

  const isExpanded = isDesktopOpen || Boolean(value);

  return (
    <>
      {/* ── Mobile Search Header Takeover (Netflix style full-width) ── */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-x-0 top-0 h-18 z-50 bg-black border-b border-white/20 px-3.5 flex items-center gap-3 shadow-2xl animate-in fade-in duration-200">
          <button
            type="button"
            onClick={closeMobileSearch}
            className="p-2 text-white/80 hover:text-white rounded-full active:bg-white/10 transition-colors"
            aria-label="Cerrar búsqueda"
          >
            <ArrowLeft size={22} />
          </button>

          <div className="flex-1 relative flex items-center bg-black rounded-full border border-white/80 focus-within:border-white px-4 py-2.5 shadow-inner transition-colors">
            <Search size={20} className="text-white/80 shrink-0 mr-3" />
            <input
              ref={mobileInputRef}
              type="text"
              placeholder="Títulos, personas, géneros..."
              value={value}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent text-lg text-white font-medium placeholder-gray-400 focus:outline-none"
            />

            {pending && (
              <Loader2 size={18} className="text-[#e50914] animate-spin shrink-0 ml-2" />
            )}

            {value && !pending && (
              <button
                type="button"
                onClick={handleClear}
                className="text-gray-400 hover:text-white p-1 rounded-full shrink-0 ml-1 active:bg-white/10"
                aria-label="Limpiar campo"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Mobile Trigger Button (when closed) ── */}
      <button
        type="button"
        onClick={openMobileSearch}
        className="md:hidden flex items-center justify-center w-10 h-10 rounded-full text-white/90 hover:text-white active:bg-white/10 transition-colors"
        aria-label="Buscar en Liss TV"
      >
        <Search size={22} />
      </button>

      {/* ── Desktop Netflix-Style Search (Solid Black & Large Typography) ── */}
      <div ref={desktopContainerRef} className={`hidden md:block ${className}`}>
        <FocusElementProvider
          className="rounded-full"
          onEnterPress={() => {
            if (!isExpanded) {
              toggleDesktop();
            } else {
              desktopInputRef.current?.focus();
            }
          }}
          strokeSize={0}
          styleFocus={{
            outline: "2px solid #e50914",
            outlineOffset: "2px",
            borderRadius: "9999px",
          }}
        >
          <div
            onClick={!isExpanded ? toggleDesktop : undefined}
            className={`group relative flex items-center h-11 sm:h-12 transition-all duration-350 ease-out cursor-pointer ${
              isExpanded
                ? "w-72 sm:w-80 lg:w-96 bg-black border border-white focus-within:border-white  rounded-full px-4 sm:px-5"
                : "w-11 justify-center rounded-full bg-transparent hover:bg-white/[0.08]"
            }`}
          >
            <Search
              size={isExpanded ? 20 : 22}
              className={`shrink-0 transition-colors duration-200 ${
                isExpanded
                  ? "text-white mr-3"
                  : "text-white/80 group-hover:text-white"
              }`}
            />

            <input
              ref={desktopInputRef}
              type="text"
              placeholder="Títulos, series, géneros..."
              value={value}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              className={`bg-transparent text-base lg:text-lg font-medium text-white placeholder:text-gray-400 placeholder:font-normal focus:outline-none transition-all duration-300 ${
                isExpanded
                  ? "w-full opacity-100"
                  : "w-0 opacity-0 pointer-events-none"
              }`}
            />

            {isExpanded && pending && (
              <Loader2
                size={18}
                className="text-[#e50914] animate-spin shrink-0 ml-2"
              />
            )}

            {isExpanded && value && !pending && (
              <button
                type="button"
                onClick={handleClear}
                className="text-gray-400 hover:text-white p-1 rounded-full shrink-0 ml-2 transition-colors cursor-pointer"
                aria-label="Limpiar búsqueda"
              >
                <X size={17} />
              </button>
            )}
          </div>
        </FocusElementProvider>
      </div>
    </>
  );
}
