"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import FocusElementProvider from "../providers/FocusElementProvider";

interface NetflixSearchProps {
  className?: string;
  isMobile?: boolean;
}

export default function NetflixSearch({
  className = "",
  isMobile = false,
}: NetflixSearchProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [value, setValue] = useState(searchParams.get("search") ?? "");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      // Si el elemento ya no está en el DOM (ej: SVG path que se re-renderizó), ignoramos.
      if (!document.contains(target)) return;
      
      if (
        containerRef.current &&
        !containerRef.current.contains(target)
      ) {
        if (!value) {
          setIsOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value]);

  function handleSearch(val: string) {
    setValue(val);
    setPending(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (val.trim() === "") {
      setPending(false);
      router.push("/");
      return;
    }

    debounceRef.current = setTimeout(() => {
      setPending(false);
      router.push(`/?search=${encodeURIComponent(val.trim())}`);
    }, 1000);
  }

  function toggleSearch() {
    if (!isOpen) {
      setIsOpen(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function clearSearch() {
    setValue("");
    handleSearch("");
    inputRef.current?.focus();
  }

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isOpen ? (isMobile ? "w-48 sm:w-56" : "w-72 lg:w-80") : "w-10"
      } ${className}`}
    >
      <FocusElementProvider className="w-full rounded-full">
        <div
          className={`group flex items-center w-full h-10 transition-all duration-500 overflow-hidden rounded-full ${
            isOpen
              ? pending
                ? "bg-black/90 border border-[#EA1C25]/50 shadow-[0_8px_32px_rgba(234,28,37,0.3)]"
                : "bg-[#0a0a0a]/80 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] focus-within:bg-black focus-within:border-white/20"
              : "bg-transparent border border-transparent hover:bg-white/10"
          }`}
          onClick={!isOpen ? toggleSearch : undefined}
          title={!isOpen ? "Buscar" : ""}
        >
          <div className="w-10 h-10 flex items-center justify-center shrink-0">
            <Search
              size={20}
              strokeWidth={isOpen ? 2 : 2.5}
              className={`transition-all duration-300 ${
                isOpen 
                  ? pending 
                    ? "text-[#EA1C25]" 
                    : "text-white/50 group-focus-within:text-white"
                  : "text-white/80 hover:text-white"
              } ${!isOpen && "cursor-pointer"}`}
              onClick={isOpen ? () => inputRef.current?.focus() : undefined}
            />
          </div>

          <input
            ref={inputRef}
            type="text"
            placeholder="Títulos, personas, géneros"
            value={value}
            onChange={(e) => handleSearch(e.target.value)}
            className={`font-poppins text-[15px] tracking-wide bg-transparent text-white placeholder-white/30 focus:outline-none transition-all duration-500 ${
              isOpen ? "w-full opacity-100 pr-2" : "w-0 opacity-0"
            }`}
          />

          {isOpen && pending && (
            <div className="w-10 h-10 flex items-center justify-center shrink-0">
              <span
                className="block w-4 h-4 rounded-full border-[2.5px] border-transparent border-t-[#EA1C25] animate-[spin_0.6s_linear_infinite]"
              />
            </div>
          )}

          {isOpen && value && !pending && (
            <div 
              className="w-10 h-10 flex items-center justify-center shrink-0 cursor-pointer"
              onClick={clearSearch}
            >
              <X
                size={18}
                className="text-white/40 hover:text-white hover:scale-110 transition-all duration-200"
              />
            </div>
          )}
        </div>
      </FocusElementProvider>
    </div>
  );
}
