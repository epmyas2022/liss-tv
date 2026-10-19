"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Popcorn, Clapperboard, Eye, Home } from "lucide-react";
import FocusContextProvider from "./providers/FocusContextProvider";
import FocusElementProvider from "./providers/FocusElementProvider";

import { useAuthentication } from "./providers/context/AuthContext";
import dynamic from "next/dynamic";
import NetflixSearch from "./ui/NetflixSearch";

const UserAvatar = dynamic(() => import("@/components/ui/UserAvatar"), { ssr: false });

const NAV_ITEMS = [
  { label: "Movies", href: "/?filter=peliculas", icon: Popcorn },
  { label: "Series", href: "/?filter=series", icon: Clapperboard },
  { label: "Watching", href: "/continue-watching", icon: Eye },
];

const MOBILE_NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  ...NAV_ITEMS,
];

const glassStyle = {
  background: "rgba(7, 7, 7, 0.65)",
  backdropFilter: "blur(28px) saturate(200%)",
  WebkitBackdropFilter: "blur(28px) saturate(200%)",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow:
    "0 8px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(234,28,37,0.10)",
} as React.CSSProperties;

export function FloatingNav() {
  const { user } = useAuthentication();
  const [active, setActive] = useState<string | null>(null);
  const router = useRouter();

  return (
    <FocusContextProvider condition={true}>
      {/* ── Desktop: premium floating pill (hidden on mobile) ── */}
      <div className="hidden md:block fixed top-5 left-1/2 -translate-x-1/2 z-50 w-max">
        <nav
          className="flex items-center gap-1 px-4 py-3.5 rounded-full"
          style={glassStyle}
        >
          {/* Brand */}
          <FocusElementProvider
            className="group rounded-full"
            strokeSize={0}
            onEnterPress={() => router.push("/")}
            styleFocus={{
              transform: "scale(1.06)",
              transition: "transform 0.15s ease",
            }}
          >
            <Link
              href="/"
              className="font-poppins px-5 text-white text-[1.7rem] font-bold shrink-0 rounded-lg tracking-tight"
            >
              LISS <span className="text-[#EA1C25]">TV</span>
            </Link>
          </FocusElementProvider>

          {/* Divider */}
          <div className="w-px h-7 bg-white/10 mx-1" />

          {/* Nav items */}
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
            <FocusElementProvider
              key={label}
              className="rounded-full group"
              strokeSize={0}
              styleFocus={{
                background: "rgba(234,28,37,0.85)",
              }}
              onEnterPress={() => router.push(href)}
            >
              <Link
                href={href}
                onClick={() => setActive(label)}
                className={`relative focus-within:outline-none hover:bg-white/10 hover:text-white ${
                  active === label
                    ? "text-white bg-white/6"
                    : "text-[rgba(255,255,255,0.60)]"
                } group-[.focus-active]:text-white flex items-center gap-2 px-5 py-2.5 rounded-full text-[15px] font-semibold tracking-wide transition-all duration-200`}
              >
                <Icon size={18} strokeWidth={2} />
                {label}
              </Link>
            </FocusElementProvider>
          ))}

          {/* Divider */}
          <div className="w-px h-7 bg-white/10 mx-1" />

          {/* Search */}
          <div className="px-2 relative flex items-center justify-center">
            <NetflixSearch />
          </div>

          {/* Avatar */}
          <div className="flex items-center pl-2 pr-2 ml-1">
            <FocusElementProvider
              className="rounded-full group w-11 h-11"
              strokeSize={0}
              styleFocus={{
                outline: "2px solid rgba(234,28,37,0.8)",
                outlineOffset: "3px",
                borderRadius: "9999px",
              }}
              onEnterPress={() => router.push("/profile")}
            >
              <Link
                href="/profile"
                className="flex items-center justify-center w-11 h-11 rounded-full bg-white/8 ring-2 ring-transparent hover:ring-white/20 transition-all duration-200 focus-within:outline-none group-[.focus-active]:bg-[#EA1C25] group-[.focus-active]:text-white text-white/70 overflow-hidden"
                aria-label="Perfil"
              >
                <UserAvatar user={user} size={40} />
              </Link>
            </FocusElementProvider>
          </div>
        </nav>
      </div>

      {/* ── Mobile: top bar (brand + search + avatar) ── */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3.5"
        style={glassStyle}
      >
        <Link href="/" className="font-poppins text-white text-[1.4rem] font-bold tracking-tight">
          Liss <span className="text-[#EA1C25]">TV</span>
        </Link>

        <div className="flex items-center gap-3">
          <NetflixSearch isMobile />

          <Link
            href="/profile"
            className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 ring-1 ring-white/15 hover:ring-[#EA1C25]/60 text-white/80 hover:text-white transition-all duration-200 overflow-hidden shrink-0"
            aria-label="Perfil"
          >
            <UserAvatar user={user} size={34} />
          </Link>
        </div>
      </div>

      {/* ── Mobile: bottom tab bar ── */}
      <div
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{
          ...glassStyle,
          borderLeft: "none",
          borderRight: "none",
          borderBottom: "none",
          borderRadius: 0,
        }}
      >
        <nav className="flex items-center justify-around py-2.5 px-3">
          {MOBILE_NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const isActive = active === label;
            return (
              <Link
                key={label}
                href={href}
                onClick={() => setActive(label)}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl transition-all duration-200 min-w-0 ${
                  isActive
                    ? "bg-[#EA1C25]/15"
                    : ""
                }`}
              >
                <Icon
                  size={24}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  className={`transition-colors duration-200 ${
                    isActive ? "text-[#EA1C25]" : "text-white/50"
                  }`}
                />
                <span
                  className={`text-[11px] font-semibold transition-colors duration-200 ${
                    isActive ? "text-[#EA1C25]" : "text-white/45"
                  }`}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
    </FocusContextProvider>
  );
}
