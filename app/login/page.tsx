"use client";

import React, { useRef, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { BrandLogo } from "@/components/layout/BrandLogo";
import FocusElementProvider from "@/components/providers/FocusElementProvider";
import FocusContextProvider from "@/components/providers/FocusContextProvider";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, loading, error } = useAuth();
  const router = useRouter();

  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between relative overflow-hidden">
      {/* ── Cinematic Poster Collage Background ── */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-55 scale-105"
        style={{
          backgroundImage:
            "url('https://assets.nflxext.com/ffe/siteui/vlv3/a00fdfd7-4916-4f12-b5ff-c05b9d7b4d07/web/SV-es-20260824-TRIFECTA-perspective_61a35102-b7d7-41ef-ab0c-e381f4eb2343_large.jpg')",
        }}
      />
      {/* Dark vignette overlay for contrast (no shadows) */}
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-black via-black/50 to-black/75" />

      {/* ── Top Header with BrandLogo only ── */}
      <header className="relative z-10 w-full max-w-[1800px] mx-auto px-6 sm:px-10 lg:px-14 py-6 sm:py-8 flex items-center">
        <BrandLogo />
      </header>

      {/* ── Center Login Card (Flat Netflix-style without shadows) ── */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md bg-black/80 border border-white/15 rounded-2xl p-7 sm:p-10 flex flex-col">
          <div className="mb-6 sm:mb-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold font-poppins text-white tracking-tight">
              Iniciar sesión
            </h1>
          </div>

          <Alert type="error" message={error} className="mb-6" />

          <FocusContextProvider condition={true}>
            <form
              ref={formRef}
              onSubmit={handleLogin}
              className="flex flex-col gap-4 sm:gap-5"
            >
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
                  Correo electrónico
                </label>
                <FocusElementProvider
                  className="rounded-xl"
                  strokeSize={0}
                  styleFocus={{
                    outline: "2px solid #e50914",
                    outlineOffset: "2px",
                    borderRadius: "12px",
                  }}
                  onEnterPress={() => emailInputRef?.current?.focus()}
                >
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3.5 bg-[#16181f]/90 border border-white/20 rounded-xl text-white text-base placeholder:text-gray-400 focus:outline-none focus:border-[#e50914] focus:ring-1 focus:ring-[#e50914] transition-colors"
                    placeholder="tu@email.com"
                    required
                    ref={emailInputRef}
                  />
                </FocusElementProvider>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <FocusElementProvider
                    className="rounded-xl"
                    strokeSize={0}
                    styleFocus={{
                      outline: "2px solid #e50914",
                      outlineOffset: "2px",
                      borderRadius: "12px",
                    }}
                    onEnterPress={() => passwordInputRef?.current?.focus()}
                  >
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3.5 pr-12 bg-[#16181f]/90 border border-white/20 rounded-xl text-white text-base placeholder:text-gray-400 focus:outline-none focus:border-[#e50914] focus:ring-1 focus:ring-[#e50914] transition-colors"
                      placeholder="••••••••"
                      required
                      ref={passwordInputRef}
                    />
                  </FocusElementProvider>

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors p-1.5 cursor-pointer"
                    aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                  >
                    {showPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>

              <FocusElementProvider
                className="rounded-xl mt-2"
                strokeSize={0}
                styleFocus={{
                  outline: "2px solid #e50914",
                  outlineOffset: "2px",
                  borderRadius: "12px",
                }}
                onEnterPress={() => formRef.current?.requestSubmit()}
              >
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-[#e50914] hover:bg-[#b80710] disabled:opacity-50 text-white font-bold text-base transition-colors cursor-pointer active:scale-95"
                >
                  {loading ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    "Iniciar sesión"
                  )}
                </button>
              </FocusElementProvider>
            </form>
          </FocusContextProvider>

          <div className="mt-8 pt-6 border-t border-white/10 text-center">
            <p className="text-xs text-gray-400 leading-relaxed">
              Al iniciar sesión aceptas los términos y condiciones de servicio de Liss TV.
            </p>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 w-full py-4 text-center text-xs text-gray-500 border-t border-white/[0.06] bg-black/50">
        <span>&copy; {new Date().getFullYear()} Liss TV. Todos los derechos reservados.</span>
      </footer>
    </div>
  );
}
