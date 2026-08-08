"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Popcorn, Clapperboard, Eye } from "lucide-react";

const NAV_ITEMS = [
  { label: "Movies", href: "/movies", icon: <Popcorn /> },
  { label: "Series", href: "/series", icon: <Clapperboard /> },
  {label: "Watching", href: "/continue-watching", icon: <Eye />},

];

export function FloatingNav() {
  const [active, setActive] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ponytail: pending covers debounce gap only — loading.tsx handles the rest
  function handleSearch(value: string) {

    if(value.trim() === "") return;

    setPending(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPending(false);
      router.push(`/?search=${encodeURIComponent(value.trim())}`);
    }, 1000);
  }

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50">
      {/* ponytail: liquid-glass via backdrop-filter + layered borders, no extra libs */}
      <nav
        className="flex items-center gap-1 px-3 py-3 rounded-full"
        style={{
          background: "rgba(7, 7, 7, 0.45)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(234,28,37,0.15)",
        }}
      >
        {/* Brand dot */}

        <Link
          href="/"
          className="font-poppins px-6 text-white text-2xl font-bold"
        >
          Liss <span className="text-[#EA1C25]">TV</span>
        </Link>

        <br></br>

        {NAV_ITEMS.map(({ label, href, icon }) => (
          <Link
            key={label}
            href={href}
            onClick={() => setActive(label)}
            className="relative flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all duration-200"
            style={{
              color: active === label ? "#fff" : "rgba(255,255,255,0.65)",
              background:
                active === label ? "rgba(234,28,37,0.85)" : "transparent",
              boxShadow:
                active === label ? "0 2px 12px rgba(234,28,37,0.4)" : "none",
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
            <span className="text-base leading-none">{icon}</span>
            {label}
          </Link>
        ))}
        <br></br>
        <div className="px-3 relative">
          <input
            type="text"
            placeholder="Search..."
            defaultValue={searchParams.get("search") ?? ""}
            className="px-3 py-2 font-poppins rounded-full text-sm bg-transparent text-white placeholder-gray-100 focus:outline-none transition-all duration-200"
            style={{
              // ponytail: border swaps to red spinner ring while pending
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
        <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
      </nav>
    </div>
  );
}
