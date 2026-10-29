"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Popcorn, Clapperboard, Bookmark, Home } from "lucide-react";
import FocusElementProvider from "../providers/FocusElementProvider";
import { useAuthentication } from "../providers/context/AuthContext";
import dynamic from "next/dynamic";
import NetflixSearch from "../ui/NetflixSearch";
import { BrandLogo } from "./BrandLogo";

const UserAvatar = dynamic(() => import("@/components/ui/UserAvatar"), {
  ssr: false,
});

interface NavItem {
  label: string;
  href: string;
  icon: typeof Home;
  filter?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Inicio", href: "/", icon: Home },
  { label: "Películas", href: "/?filter=peliculas", icon: Popcorn, filter: "peliculas" },
  { label: "Series", href: "/?filter=series", icon: Clapperboard, filter: "series" },
  { label: "Mi Lista", href: "/my-list", icon: Bookmark },
];

export function Navbar() {
  const { user } = useAuthentication();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentFilter = searchParams.get("filter");

  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 20);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isItemActive = (item: NavItem): boolean => {
    if (item.href === "/my-list") {
      return pathname === "/my-list";
    }
    if (pathname === "/") {
      if (item.filter) {
        return currentFilter === item.filter;
      }
      return !currentFilter && !searchParams.get("search");
    }
    return false;
  };

  return (
    <>
      {/* ── Top Fixed Streaming Header ── */}
      <header
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-400 ease-out ${
          isScrolled
            ? "bg-[#090a0c] border-b border-white/[0.08] shadow-2xl py-3 sm:py-3.5"
            : "bg-gradient-to-b from-[#090a0c]/90 via-[#090a0c]/40 to-transparent py-4 sm:py-5"
        }`}
      >
        <div className="max-w-[1800px] mx-auto px-4 sm:px-8 lg:px-12 flex items-center justify-between gap-4">
          {/* Left: Brand Logo + Desktop Nav Links */}
          <div className="flex items-center gap-6 lg:gap-10">
            <FocusElementProvider
              className="group rounded-md focus:outline-none shrink-0"
              strokeSize={0}
              onEnterPress={() => router.push("/")}
              styleFocus={{ transform: "scale(1.04)" }}
            >
              <BrandLogo />
            </FocusElementProvider>

            {/* Desktop Nav Items */}
            <nav className="hidden md:flex items-center gap-2 lg:gap-3">
              {NAV_ITEMS.map((item) => {
                const active = isItemActive(item);
                return (
                  <FocusElementProvider
                    key={item.label}
                    className="rounded-lg group"
                    strokeSize={0}
                    styleFocus={{ background: "rgba(229, 9, 20, 0.85)" }}
                    onEnterPress={() => router.push(item.href)}
                  >
                    <Link
                      href={item.href}
                      className={`relative px-4 py-2 rounded-lg text-base lg:text-[17px] font-semibold tracking-normal transition-all duration-200 select-none ${
                        active
                          ? "text-white font-bold"
                          : "text-gray-300 hover:text-white hover:bg-white/[0.08]"
                      } group-[.focus-active]:text-white`}
                    >
                      {item.label}
                      {active && (
                        <span className="absolute -bottom-1 left-4 right-4 h-[3px] bg-[#e50914] rounded-full shadow-[0_0_12px_#e50914]" />
                      )}
                    </Link>
                  </FocusElementProvider>
                );
              })}
            </nav>
          </div>

          {/* Right: Search & Profile */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Search */}
            <NetflixSearch />

            {/* User Profile Avatar */}
            <FocusElementProvider
              className="rounded-full group w-9 sm:w-10 h-9 sm:h-10 shrink-0"
              strokeSize={0}
              styleFocus={{
                outline: "2px solid #e50914",
                outlineOffset: "2px",
                borderRadius: "9999px",
              }}
              onEnterPress={() => router.push("/profile")}
            >
              <Link
                href="/profile"
                className="flex items-center justify-center w-9 sm:w-10 h-9 sm:h-10 rounded-full bg-white/[0.08] ring-1 ring-white/10 hover:ring-white/30 transition-all duration-200 overflow-hidden focus:outline-none group-[.focus-active]:bg-[#e50914] group-[.focus-active]:text-white text-gray-300 hover:shadow-[0_0_12px_rgba(229,9,20,0.4)]"
                aria-label="Perfil de usuario"
              >
                <UserAvatar user={user} size={36} />
              </Link>
            </FocusElementProvider>
          </div>
        </div>
      </header>

      {/* ── Mobile Bottom Navigation Bar (Glass Dock) ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0b0c10] border-t border-white/[0.08] px-2 py-2 flex items-center justify-around shadow-2xl pb-[calc(0.6rem+env(safe-area-inset-bottom,0px))]"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(item);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex flex-col items-center gap-1.5 py-1.5 px-3.5 rounded-xl transition-all duration-200 ${
                active
                  ? "text-[#e50914] font-bold bg-white/[0.08]"
                  : "text-gray-300 hover:text-white"
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              <span className="text-[12px] font-medium tracking-normal">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
