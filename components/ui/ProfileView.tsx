"use client";

import { useRouter } from "next/navigation";
import { useAuthentication } from "../providers/context/AuthContext";
import { useRef, useState, useEffect } from "react";
import { pb } from "@/hooks/useAuth";
import { ClientResponseError, RecordModel } from "pocketbase";
import Link from "next/link";
import { ArrowLeft, Camera, Loader2, LogOut, User, Lock, X } from "lucide-react";
import NextImage from "next/image";
import { Alert } from "./Alert";
import FocusContextProvider from "../providers/FocusContextProvider";
import FocusElementProvider from "../providers/FocusElementProvider";

const FOCUS_STYLE = {
  outline: "2px solid white",
  borderRadius: "12px",
} as React.CSSProperties;

const FOCUS_STYLE_ROUND = {
  ...FOCUS_STYLE,
  borderRadius: "9999px",
} as React.CSSProperties;

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
      <div className="min-h-screen bg-[#070707] text-white pt-24 px-4 pb-10">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Back Button */}
          <FocusElementProvider
            className="w-fit "
            onEnterPress={() => router.push("/")}
            strokeSize={0}
            styleFocus={{
              borderBottom: "1px solid white",
            }}
          >
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-white/70 hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
              <span className="font-medium font-poppins">Volver al inicio</span>
            </Link>
          </FocusElementProvider>

          {/* Header Profile */}
          <div className="flex flex-col md:flex-row items-center gap-6 p-6 md:p-8 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md text-center md:text-left">
            {/* Avatar */}
            <FocusElementProvider
              onEnterPress={() => setShowAvatarSelector(true)}
              strokeSize={0}
              styleFocus={FOCUS_STYLE_ROUND}
            >
              <div className="relative group shrink-0">
                <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center border border-white/20 overflow-hidden relative">
                  {uploadingAvatar ? (
                    <Loader2
                      size={30}
                      className="animate-spin text-[#EA1C25]"
                    />
                  ) : user?.avatar ? (
                    <NextImage
                      width={96}
                      height={96}
                      src={pb.files.getURL(user, user.avatar)}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User size={40} className="text-white/50" />
                  )}

                  {!uploadingAvatar && (
                    <button
                      onClick={() => setShowAvatarSelector(true)}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity cursor-pointer"
                      title="Cambiar foto de perfil"
                    >
                      <Camera size={24} className="text-white mb-1" />
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

            <div className="flex-1 w-full">
              <h1 className="text-2xl md:text-3xl font-bold font-poppins truncate">
                {user?.name || user?.username || "Usuario"}
              </h1>
              <p className="text-white/60 truncate">{user?.email}</p>
            </div>

            {/* Logout */}
            <FocusElementProvider
              onEnterPress={() => logoutBtnRef.current?.click()}
              strokeSize={0}
              styleFocus={FOCUS_STYLE}
            >
              <button
                ref={logoutBtnRef}
                onClick={handleLogout}
                className="flex items-center justify-center gap-2 w-full md:w-auto px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors font-medium mt-2 md:mt-0"
              >
                <LogOut size={18} />
                Cerrar Sesión
              </button>
            </FocusElementProvider>
          </div>

          {/* Change Password */}
          <div className="p-6 md:p-8 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md">
            <div className="flex items-center gap-3 mb-6">
              <Lock className="text-[#EA1C25]" />
              <h2 className="text-xl font-bold font-poppins">
                Cambiar Contraseña
              </h2>
            </div>

            <Alert
              type={message.type as "error" | "success" | "info"}
              message={message.text}
              className="mb-6"
            />

            <form
              onSubmit={handleChangePassword}
              className="space-y-5 max-w-md"
            >
              <div>
                <label className="block text-sm font-medium mb-1.5 text-white/80">
                  Contraseña Actual
                </label>
                <FocusElementProvider
                  strokeSize={0}
                  styleFocus={{ ...FOCUS_STYLE, borderRadius: "12px" }}
                  onEnterPress={() => oldPasswordRef.current?.focus()}
                >
                  <input
                    ref={oldPasswordRef}
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-black/30 border border-gray-600 rounded-xl focus:outline-none focus:border-[#EA1C25] text-white transition-colors"
                    required
                  />
                </FocusElementProvider>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-white/80">
                  Nueva Contraseña
                </label>
                <FocusElementProvider
                  strokeSize={0}
                  styleFocus={{ ...FOCUS_STYLE, borderRadius: "12px" }}
                  onEnterPress={() => newPasswordRef.current?.focus()}
                >
                  <input
                    ref={newPasswordRef}
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-black/30 border border-gray-600 rounded-xl focus:outline-none focus:border-[#EA1C25] text-white transition-colors"
                    required
                  />
                </FocusElementProvider>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-white/80">
                  Confirmar Nueva Contraseña
                </label>
                <FocusElementProvider
                  strokeSize={0}
                  styleFocus={{ ...FOCUS_STYLE, borderRadius: "12px" }}
                  onEnterPress={() => confirmPasswordRef.current?.focus()}
                >
                  <input
                    ref={confirmPasswordRef}
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-black/30 border border-gray-600 rounded-xl focus:outline-none focus:border-[#EA1C25] text-white transition-colors"
                    required
                  />
                </FocusElementProvider>
              </div>

              {/* Submit */}
              <FocusElementProvider
                className="mt-2 w-fit rounded-xl"
                onEnterPress={() => submitBtnRef.current?.click()}
                strokeSize={0}
                styleFocus={{ ...FOCUS_STYLE }}
              >
                <button
                  ref={submitBtnRef}
                  type="submit"
                  disabled={loading}
                  className=" flex items-center justify-center gap-2 px-6 py-3 bg-[#EA1C25] hover:bg-[#c9171f] disabled:opacity-70 text-white font-bold rounded-xl transition-colors"
                >
                  {loading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    "Actualizar Contraseña"
                  )}
                </button>
              </FocusElementProvider>
            </form>
          </div>

        </div>
      </div>

      {/* Avatar Selection Modal */}
      {showAvatarSelector && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 overflow-hidden">
          <div className="bg-[#141414] w-full max-w-4xl max-h-[85vh] rounded-3xl flex flex-col border border-white/20 shadow-2xl relative">
            
            {/* Header */}
            <div className="flex items-center justify-between p-6 md:p-8 border-b border-white/10 shrink-0">
              <h2 className="text-xl md:text-2xl font-bold font-poppins text-white">
                Editar perfil
              </h2>
              <FocusElementProvider
                onEnterPress={() => setShowAvatarSelector(false)}
                strokeSize={0}
                styleFocus={FOCUS_STYLE_ROUND}
                className="shrink-0"
              >
                <button
                  onClick={() => setShowAvatarSelector(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white"
                >
                  <X size={24} />
                </button>
              </FocusElementProvider>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto p-6 md:p-8">
              <div className="mb-8 flex justify-center">
                <FocusElementProvider
                  onEnterPress={() => fileInputRef.current?.click()}
                  strokeSize={0}
                  styleFocus={FOCUS_STYLE}
                  className="w-full max-w-sm"
                >
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-3 w-full px-6 py-4 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10 text-white font-medium"
                  >
                    <Camera size={20} />
                    Subir foto
                  </button>
                </FocusElementProvider>
              </div>

              <div className="space-y-8">
                <h2 className="text-lg font-bold font-poppins text-white/50 text-center uppercase tracking-wider mb-6">
                  Avatares Clásicos
                </h2>
                
                {loadingAvatars ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin text-[#EA1C25]" size={32} />
                  </div>
                ) : predefinedAvatars.length > 0 ? (
                  <div className="space-y-10">
                    {Object.entries(
                      predefinedAvatars.reduce((acc, avatar) => {
                        const cat = avatar.category || "Otros";
                        if (!acc[cat]) acc[cat] = [];
                        acc[cat].push(avatar);
                        return acc;
                      }, {} as Record<string, RecordModel[]>)
                    ).map(([category, avatars]) => (
                      <div key={category}>
                        <h3 className="text-lg font-semibold text-white/80 mb-4 capitalize">
                          {category}
                        </h3>
                        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-4">
                          {avatars.map((av) => (
                            <FocusElementProvider
                              key={av.id}
                              strokeSize={0}
                              styleFocus={FOCUS_STYLE}
                              className="w-full aspect-square relative rounded-xl overflow-hidden border-[3px] border-transparent hover:border-white focus:border-white transition-all bg-white/5 group"
                              onEnterPress={() => handleSelectPredefinedAvatar(av.image)}
                            >
                              <button
                                onClick={() => handleSelectPredefinedAvatar(av.image)}
                                disabled={uploadingAvatar}
                                className="w-full h-full flex items-center justify-center"
                                title={av.name}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={av.image}
                                  alt={av.name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
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
                  <p className="text-white/50 text-center">No hay avatares disponibles.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </FocusContextProvider>
  );
}
