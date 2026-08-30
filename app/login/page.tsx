"use client";

import React, { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, loading, error } = useAuth();
  const router = useRouter();

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
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white relative px-3 sm:px-0">
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-50"
        style={{ backgroundImage: 'url(https://assets.nflxext.com/ffe/siteui/vlv3/a00fdfd7-4916-4f12-b5ff-c05b9d7b4d07/web/SV-es-20260824-TRIFECTA-perspective_61a35102-b7d7-41ef-ab0c-e381f4eb2343_large.jpg)' }}
      />
      {/* Gradient Overlay for better readability */}
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-black via-black/40 to-black/80" />

      {/* Login Card */}
      <div 
        className="w-full max-w-md p-8 sm:p-10 relative z-10 rounded-3xl"
        style={{
          background: "linear-gradient(145deg, rgba(20,20,20,0.4) 0%, rgba(5,5,5,0.6) 100%)",
          backdropFilter: "blur(32px) saturate(200%)",
          WebkitBackdropFilter: "blur(32px) saturate(200%)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 30px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 0 20px rgba(234,28,37,0.1)",
        }}
      >
        <h1 className="text-4xl sm:text-3xl font-bold font-poppins text-center mb-2 sm:mb-2">
          Liss <span className="text-[#EA1C25]">TV</span>
        </h1>
        <p className="text-white/60 text-center mb-8 sm:mb-6 text-lg sm:text-base">Inicia sesión en tu cuenta</p>
        
        <Alert type="error" message={error} className="mb-6" />

        <form onSubmit={handleLogin} className="flex flex-col gap-5 sm:gap-4">
          <div>
            <label className="block text-base sm:text-sm font-medium mb-2 sm:mb-1.5 text-white/80">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-5 py-4 sm:px-4 sm:py-3 bg-black/30 border border-gray-600 rounded-xl focus:outline-none focus:border-[#EA1C25] text-white transition-colors text-lg sm:text-base"
              placeholder="tu@email.com"
              required
            />
          </div>
          <div>
            <label className="block text-base sm:text-sm font-medium mb-2 sm:mb-1.5 text-white/80">Contraseña</label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-4 sm:px-4 sm:py-3 pr-14 sm:pr-12 bg-black/30 border border-gray-600 rounded-xl focus:outline-none focus:border-[#EA1C25] text-white transition-colors text-lg sm:text-base"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 sm:right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors p-2"
              >
                {showPassword ? <EyeOff size={22} className="sm:w-5 sm:h-5" /> : <Eye size={22} className="sm:w-5 sm:h-5" />}
              </button>
            </div>
          </div>
          
          <button 
            type="submit"
            disabled={loading}
            className="w-full mt-4 sm:mt-4 flex justify-center items-center gap-2 bg-[#EA1C25] hover:bg-[#c9171f] disabled:opacity-70 disabled:hover:bg-[#EA1C25] text-white font-bold py-4 sm:py-3 rounded-xl transition-colors text-lg sm:text-base"
          >
            {loading ? <Loader2 size={24} className="animate-spin sm:w-5 sm:h-5" /> : "Iniciar Sesión"}
          </button>
        </form>
      </div>
    </div>
  );
}
