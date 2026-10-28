"use client";

import { useRouter } from "next/navigation";
import { useAuthentication } from "../providers/context/AuthContext";
import { useRef, useState, useEffect } from "react";
import { pb } from "@/hooks/useAuth";
import { ClientResponseError, RecordModel } from "pocketbase";
import Link from "next/link";
import { ArrowLeft, Camera, Loader2, LogOut, User, Lock, X, CheckCircle } from "lucide-react";
import NextImage from "next/image";
import { Alert } from "./Alert";
import FocusContextProvider from "../providers/FocusContextProvider";
import FocusElementProvider from "../providers/FocusElementProvider";

const FOCUS_STYLE: React.CSSProperties = {
  outline: "2px solid #e50914",
  outlineOffset: "2px",
  borderRadius: "12px",
};

const FOCUS_STYLE_ROUND: React.CSSProperties = {
  outline: "2px solid #e50914",
  outlineOffset: "2px",
  borderRadius: "9999px",
};

export default function ProfileView() {
  const router = useRouter();
  const { user, logout } = useAuthentication();

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const oldPasswordRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const logoutBtnRef = useRef<HTMLButtonElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [predefinedAvatars, setPredefinedAvatars] = useState<RecordModel[]>([]);
  const [loadingAvatars, setLoadingAvatars] = useState(true);
  const [showAvatarSelector, setShowAvatarSelector] = useState(false);

  useEffect(() => {
    const fetchAvatars = async () => {
      try {
        const records = await pb.collection("avatars").getFullList({
          sort: "category,name",
        });
        setPredefinedAvatars(records);
      } catch (err) {
        console.error("Error al cargar avatares:", err);
      } finally {
        setLoadingAvatars(false);
      }
    };
    fetchAvatars();
  }, []);

  const handleSelectPredefinedAvatar = async (avatarUrl: string) => {
    if (!user) return;
    setUploadingAvatar(true);
    try {
      const response = await fetch(avatarUrl);
      if (!response.ok) throw new Error("No se pudo descargar la imagen");

      const blob = await response.blob();
      const file = new File([blob], "avatar.jpg", { type: blob.type || "image/jpeg" });

      const formData = new FormData();
      formData.append("avatar", file);

      const updatedUser = await pb.collection("users").update(user.id, formData);
      pb.authStore.save(pb.authStore.token, updatedUser);

      setMessage({
        type: "success",
        text: "Foto de perfil actualizada exitosamente.",
      });
      setShowAvatarSelector(false);
    } catch (err) {
      console.error(err);
      setMessage({
        type: "error",
        text: "Error al actualizar el avatar predefinido.",
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const updatedUser = await pb
        .collection("users")
        .update(user.id, formData);
      pb.authStore.save(pb.authStore.token, updatedUser);

      setMessage({
        type: "success",
        text: "Foto de perfil actualizada exitosamente.",
      });
      setShowAvatarSelector(false);
    } catch (_err) {
      setMessage({
        type: "error",
        text: "Error al subir la imagen.",
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({
        type: "error",
        text: "Las contraseñas nuevas no coinciden.",
      });
      return;
    }
    if (!user) return;

    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      await pb.collection("users").update(user.id, {
        oldPassword,
        password: newPassword,
        passwordConfirm: confirmPassword,
      });
      setMessage({
        type: "success",
        text: "Contraseña actualizada exitosamente.",
      });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (err instanceof ClientResponseError) {
        setMessage({
          type: "error",
          text:
            err?.response?.message ||
            err.message ||
            "Error al actualizar la contraseña.",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <FocusContextProvider condition={true} trackChildren={true}>
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
        {/* Breadcrumb Navigation */}
        <FocusElementProvider
          className="w-fit"
          onEnterPress={() => router.push("/")}
          strokeSize={0}
          styleFocus={{
            borderBottom: "2px solid #e50914",
          }}
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors py-1"
          >
            <ArrowLeft size={16} />
            <span className="font-medium font-poppins">Volver al catálogo</span>
          </Link>
        </FocusElementProvider>

        {/* User Card */}
        <div className="flex flex-col md:flex-row items-center gap-6 p-6 sm:p-8 bg-[#131519] border border-white/[0.08] rounded-2xl text-center md:text-left">
          {/* Avatar with Camera Overlay */}
          <FocusElementProvider
            onEnterPress={() => setShowAvatarSelector(true)}
            strokeSize={0}
            styleFocus={FOCUS_STYLE_ROUND}
          >
            <div className="relative group shrink-0">
              <div className="w-24 h-24 rounded-full bg-white/[0.06] flex items-center justify-center border border-white/15 overflow-hidden relative">
                {uploadingAvatar ? (
                  <Loader2
                    size={30}
                    className="animate-spin text-[#e50914]"
                  />
                ) : user?.avatar ? (
                  <NextImage
                    width={96}
                    height={96}
                    src={pb.files.getURL(user, user.avatar)}
                    alt="Avatar de usuario"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User size={40} className="text-gray-400" />
                )}

                {!uploadingAvatar && (
                  <button
                    type="button"
                    onClick={() => setShowAvatarSelector(true)}
                    className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity cursor-pointer"
                    title="Cambiar foto de perfil"
                    aria-label="Cambiar foto de perfil"
                  >
                    <Camera size={22} className="text-white mb-0.5" />
                    <span className="text-[10px] text-white/90 font-medium uppercase tracking-wider">
                      Cambiar
                    </span>
                  </button>
                )}
              </div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleAvatarChange}
              />
            </div>
          </FocusElementProvider>

          {/* User Details */}
          <div className="flex-1 w-full min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold font-poppins text-white truncate tracking-tight">
              {user?.name || user?.username || "Usuario"}
            </h1>
            <p className="text-sm text-gray-400 truncate mt-0.5">{user?.email}</p>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#e50914]/15 border border-[#e50914]/30 text-[#e50914] mt-2.5">
              <CheckCircle size={12} />
              <span>Cuenta activa</span>
            </div>
          </div>

          {/* Logout Button */}
          <FocusElementProvider
            onEnterPress={() => logoutBtnRef.current?.click()}
            strokeSize={0}
            styleFocus={FOCUS_STYLE}
          >
            <button
              ref={logoutBtnRef}
              type="button"
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 w-full md:w-auto px-5 py-2.5 rounded-xl border border-white/10 bg-white/[0.06] hover:bg-[#e50914] hover:border-[#e50914] text-gray-300 hover:text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              <LogOut size={16} />
              <span>Cerrar Sesión</span>
            </button>
          </FocusElementProvider>
        </div>

        {/* Change Password Card */}
        <div className="p-6 sm:p-8 bg-[#131519] border border-white/[0.08] rounded-2xl">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-lg bg-[#e50914]/15 flex items-center justify-center text-[#e50914]">
              <Lock size={18} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold font-poppins text-white">
                Seguridad y Contraseña
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Actualizá tu contraseña para mantener tu cuenta protegida
              </p>
            </div>
          </div>

          <Alert
            type={message.type as "error" | "success" | "info"}
            message={message.text}
            className="mb-6"
          />

          <form
            onSubmit={handleChangePassword}
            className="space-y-4 max-w-md"
          >
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
                Contraseña Actual
              </label>
              <FocusElementProvider
                strokeSize={0}
                styleFocus={FOCUS_STYLE}
                onEnterPress={() => oldPasswordRef.current?.focus()}
              >
                <input
                  ref={oldPasswordRef}
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full px-4 py-2.5 sm:py-3 bg-[#090a0c] border border-white/15 rounded-xl focus:outline-none focus:border-[#e50914] focus:ring-1 focus:ring-[#e50914] text-white text-sm sm:text-base transition-colors placeholder:text-gray-600"
                  placeholder="Ingresá tu contraseña actual"
                  required
                />
              </FocusElementProvider>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
                Nueva Contraseña
              </label>
              <FocusElementProvider
                strokeSize={0}
                styleFocus={FOCUS_STYLE}
                onEnterPress={() => newPasswordRef.current?.focus()}
              >
                <input
                  ref={newPasswordRef}
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2.5 sm:py-3 bg-[#090a0c] border border-white/15 rounded-xl focus:outline-none focus:border-[#e50914] focus:ring-1 focus:ring-[#e50914] text-white text-sm sm:text-base transition-colors placeholder:text-gray-600"
                  placeholder="Mínimo 8 caracteres"
                  required
                />
              </FocusElementProvider>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
                Confirmar Nueva Contraseña
              </label>
              <FocusElementProvider
                strokeSize={0}
                styleFocus={FOCUS_STYLE}
                onEnterPress={() => confirmPasswordRef.current?.focus()}
              >
                <input
                  ref={confirmPasswordRef}
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 sm:py-3 bg-[#090a0c] border border-white/15 rounded-xl focus:outline-none focus:border-[#e50914] focus:ring-1 focus:ring-[#e50914] text-white text-sm sm:text-base transition-colors placeholder:text-gray-600"
                  placeholder="Repetí la nueva contraseña"
                  required
                />
              </FocusElementProvider>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <FocusElementProvider
                className="w-full sm:w-auto rounded-xl"
                onEnterPress={() => submitBtnRef.current?.click()}
                strokeSize={0}
                styleFocus={FOCUS_STYLE}
              >
                <button
                  ref={submitBtnRef}
                  type="submit"
                  disabled={loading}
                  className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 bg-[#e50914] hover:bg-[#b80710] disabled:opacity-50 text-white font-bold rounded-xl transition-colors text-sm sm:text-base cursor-pointer active:scale-95"
                >
                  {loading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    "Guardar Contraseña"
                  )}
                </button>
              </FocusElementProvider>
            </div>
          </form>
        </div>
      </div>

      {/* Avatar Selection Modal (Clean flat modal, no shadows, no blur) */}
      {showAvatarSelector && (
        <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4 md:p-6 overflow-hidden animate-in fade-in duration-200">
          <div className="bg-[#131519] w-full max-w-4xl max-h-[85vh] rounded-2xl flex flex-col border border-white/15 relative overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-white/10 shrink-0">
              <h2 className="text-xl sm:text-2xl font-bold font-poppins text-white">
                Elegir foto de perfil
              </h2>
              <FocusElementProvider
                onEnterPress={() => setShowAvatarSelector(false)}
                strokeSize={0}
                styleFocus={FOCUS_STYLE_ROUND}
                className="shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setShowAvatarSelector(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white cursor-pointer"
                  aria-label="Cerrar modal"
                >
                  <X size={20} />
                </button>
              </FocusElementProvider>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto p-5 sm:p-6 space-y-6 custom-scrollbar">
              <div className="flex justify-center">
                <FocusElementProvider
                  onEnterPress={() => fileInputRef.current?.click()}
                  strokeSize={0}
                  styleFocus={FOCUS_STYLE}
                  className="w-full max-w-sm"
                >
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-2.5 w-full px-6 py-3 bg-white/[0.05] hover:bg-white/[0.1] rounded-xl transition-colors border border-white/10 text-white font-semibold text-sm cursor-pointer"
                  >
                    <Camera size={18} />
                    <span>Subir desde tu dispositivo</span>
                  </button>
                </FocusElementProvider>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 text-center mb-5">
                  Avatares Clásicos
                </h3>

                {loadingAvatars ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="animate-spin text-[#e50914]" size={32} />
                  </div>
                ) : predefinedAvatars.length > 0 ? (
                  <div className="space-y-6">
                    {Object.entries(
                      predefinedAvatars.reduce((acc, avatar) => {
                        const cat = avatar.category || "General";
                        if (!acc[cat]) acc[cat] = [];
                        acc[cat].push(avatar);
                        return acc;
                      }, {} as Record<string, RecordModel[]>)
                    ).map(([category, avatars]) => (
                      <div key={category}>
                        <h4 className="text-sm font-semibold text-gray-300 mb-3 capitalize">
                          {category}
                        </h4>
                        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 sm:gap-4">
                          {avatars.map((av) => (
                            <FocusElementProvider
                              key={av.id}
                              strokeSize={0}
                              styleFocus={FOCUS_STYLE}
                              className="w-full aspect-square relative rounded-xl overflow-hidden border-2 border-transparent hover:border-[#e50914] focus:border-[#e50914] transition-all bg-white/[0.04] group cursor-pointer"
                              onEnterPress={() => handleSelectPredefinedAvatar(av.image)}
                            >
                              <button
                                type="button"
                                onClick={() => handleSelectPredefinedAvatar(av.image)}
                                disabled={uploadingAvatar}
                                className="w-full h-full flex items-center justify-center cursor-pointer"
                                title={av.name}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={av.image}
                                  alt={av.name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  loading="lazy"
                                />
                              </button>
                            </FocusElementProvider>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center text-sm">
                    No hay avatares predefinidos disponibles.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </FocusContextProvider>
  );
}
