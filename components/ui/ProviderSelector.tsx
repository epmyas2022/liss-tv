"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Server, ChevronDown, Check } from "lucide-react";
import {
  getActiveProviderId,
  getAvailableProviders,
  setActiveProvider,
} from "@/app/actions/movie";
import FocusElementProvider from "../providers/FocusElementProvider";

interface ProviderOption {
  id: string;
  name: string;
}

export function ProviderSelector() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [activeProvider, setActiveProviderState] = useState<string>("gnula");
  const [providers, setProviders] = useState<ProviderOption[]>([
    { id: "gnula", name: "Gnula HD" },
    { id: "solo-latino", name: "Solo Latino" },
  ]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [active, available] = await Promise.all([
          getActiveProviderId(),
          getAvailableProviders(),
        ]);
        if (isMounted) {
          if (active) setActiveProviderState(active);
          if (available && available.length > 0) setProviders(available);
        }
      } catch (err) {
        console.warn("[ProviderSelector] Error loading providers:", err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelect = (id: string) => {
    if (id === activeProvider) {
      setIsOpen(false);
      return;
    }
    setActiveProviderState(id);
    setIsOpen(false);
    startTransition(async () => {
      await setActiveProvider(id);
      router.refresh();
    });
  };

  const currentProviderName =
    providers.find((p) => p.id === activeProvider)?.name || "Proveedor";

  return (
    <div className="relative">
      <FocusElementProvider
        className="rounded-lg group"
        strokeSize={0}
        onEnterPress={() => setIsOpen((prev) => !prev)}
        styleFocus={{ outline: "2px solid #e50914" }}
      >
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 border cursor-pointer select-none ${
            isPending ? "opacity-50 pointer-events-none" : ""
          } ${
            isOpen
              ? "bg-white/10 border-white/20 text-white"
              : "bg-white/[0.04] border-white/[0.08] text-gray-300 hover:text-white hover:bg-white/[0.08]"
          }`}
          aria-label="Seleccionar proveedor de streaming"
        >
          <Server size={14} className="text-[#e50914] shrink-0" />
          <span className="hidden sm:inline max-w-[90px] truncate">
            {currentProviderName}
          </span>
          <ChevronDown
            size={12}
            className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      </FocusElementProvider>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-44 rounded-xl bg-[#131519] border border-white/10 shadow-2xl z-40 py-1.5 overflow-hidden backdrop-blur-md">
            <div className="px-3 py-1.5 border-b border-white/[0.06] mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Fuente / Driver
              </span>
            </div>
            {providers.map((p) => {
              const selected = p.id === activeProvider;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs sm:text-sm text-left transition-colors duration-150 cursor-pointer ${
                    selected
                      ? "text-white font-semibold bg-white/[0.08]"
                      : "text-gray-300 hover:text-white hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                  {selected && (
                    <Check size={14} className="text-[#e50914] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
