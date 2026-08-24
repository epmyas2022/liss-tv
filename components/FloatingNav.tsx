"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Popcorn, Clapperboard, Eye, Search, X } from "lucide-react";
import FocusContextProvider from "./providers/FocusContextProvider";
import FocusElementProvider from "./providers/FocusElementProvider";

const NAV_ITEMS = [
  { label: "Movies", href: "/?filter=peliculas", icon: Popcorn },
  { label: "Series", href: "/?filter=series", icon: Clapperboard },
  { label: "Watching", href: "/continue-watching", icon: Eye },
];

const glassStyle = {
  background: "rgba(7, 7, 7, 0.55)",
  backdropFilter: "blur(24px) saturate(180%)",
  WebkitBackdropFilter: "blur(24px) saturate(180%)",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow:
    "0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(234,28,37,0.15)",
} as React.CSSProperties;

export function FloatingNav() {
  const [active, setActive] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ponytail: pending covers debounce gap only — loading.tsx handles the rest
  function handleSearch(value: string) {
    if (value.trim() === "") return;
    setPending(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPending(false);
      router.push(`/?search=${encodeURIComponent(value.trim())}`);
    }, 1000);
  }

  function openSearch() {
    setSearchOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  return (
    <FocusContextProvider condition={true}>
      {/* ── Desktop: single floating pill (hidden on mobile) ── */}
      <div className="hidden md:block fixed top-6 left-1/2 -translate-x-1/2 z-50 w-max">
        <nav
          className="flex items-center gap-1 px-3 py-3 rounded-full"
          style={glassStyle}
        >
          <FocusElementProvider
            className="rounded-full"
            strokeSize={0}
            styleFocus={{ backgroundColor: "rgba(255,255,255,0.17)" }}
          >
            <Link
              href="/"
              className="font-poppins px-6 text-white text-2xl font-bold shrink-0"
            >
              Liss <span className="text-[#EA1C25]">TV</span>
            </Link>
          </FocusElementProvider>

          {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
            <FocusElementProvider
              key={label}
              className="rounded-full"
              strokeSize={0}
              styleFocus={{
                background: "rgba(234,28,37,0.85)",
                color: "#fff",
                boxShadow: "0 2px 12px rgba(234,28,37,0.4)",
              }}
              onEnterPress={() => router.push(href)}
            >
              <Link
                href={href}
                onClick={() => setActive(label)}
                className="relative flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all duration-200"
                style={{
                  color: active === label ? "#fff" : "rgba(255,255,255,0.65)",
                  background:
                    active === label ? "rgba(234,28,37,0.85)" : "transparent",
                  boxShadow:
                    active === label
                      ? "0 2px 12px rgba(234,28,37,0.4)"
                      : "none",
                }}
                onMouseEnter={(e) => {
                  if (active !== label) {
                    (e.currentTarget as HTMLElement).style.color = "#fff";
                    (e.currentTarget as HTMLElement).style.background =
                      "rgba(255,255,255,0.08)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (active !== label) {
                    (e.currentTarget as HTMLElement).style.color =
                      "rgba(255,255,255,0.65)";
                    (e.currentTarget as HTMLElement).style.background =
                      "transparent";
                  }
                }}
              >
                <Icon size={16} />
                {label}
              </Link>
            </FocusElementProvider>
          ))}

          <div className="px-3 relative">
            <input
              type="text"
              placeholder="Search..."
              defaultValue={searchParams.get("search") ?? ""}
              className="px-3 py-2 font-poppins rounded-full text-sm bg-transparent text-white placeholder-gray-400 focus:outline-none transition-all duration-200"
              style={{
                border: pending
                  ? "2px solid #EA1C25"
                  : "2px solid rgba(209,213,219,0.6)",
                boxShadow: pending ? "0 0 0 2px rgba(234,28,37,0.25)" : "none",
              }}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {pending && (
              <span
                className="absolute right-5 top-1/2 -translate-y-1/2 block w-3.5 h-3.5 rounded-full border-2 border-transparent"
                style={{
                  borderTopColor: "#EA1C25",
                  animation: "spin 0.6s linear infinite",
                }}
              />
            )}
          </div>
        </nav>
      </div>

      {/* ── Mobile: top bar (brand + search toggle) ── */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3"
        style={glassStyle}
      >
        <Link href="/" className="font-poppins text-white text-xl font-bold">
          Liss <span className="text-[#EA1C25]">TV</span>
        </Link>

        <div className="flex items-center gap-2">
          {/* ponytail: inline expand — no modal, no extra state complexity */}
          {searchOpen ? (
            <div className="flex items-center gap-2">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search..."
                  defaultValue={searchParams.get("search") ?? ""}
                  className="w-44 px-3 py-1.5 font-poppins rounded-full text-sm bg-white/10 text-white placeholder-gray-400 focus:outline-none"
                  style={{
                    border: pending
                      ? "2px solid #EA1C25"
                      : "2px solid rgba(209,213,219,0.5)",
                  }}
                  onChange={(e) => handleSearch(e.target.value)}
                />
                {pending && (
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 block w-3 h-3 rounded-full border-2 border-transparent"
                    style={{
                      borderTopColor: "#EA1C25",
                      animation: "spin 0.6s linear infinite",
                    }}
                  />
                )}
              </div>
              <button
                onClick={() => setSearchOpen(false)}
                className="text-white/70 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
          ) : (
            <button
              onClick={openSearch}
              className="text-white/70 hover:text-white p-1"
            >
              <Search size={20} />
            </button>
          )}
        </div>
      </div>

      {/* ── Mobile: bottom tab bar ── */}
      <div
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50"
        style={glassStyle}
      >
        <nav className="flex items-center justify-around py-2 px-4">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              onClick={() => setActive(label)}
              className="flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-all duration-200 min-w-0"
              style={{
                color: active === label ? "#EA1C25" : "rgba(255,255,255,0.55)",
              }}
            >
              <Icon size={22} />
              <span className="text-[11px] font-semibold">{label}</span>
            </Link>
          ))}
        </nav>
      </div>

      <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
    </FocusContextProvider>
  );
}
