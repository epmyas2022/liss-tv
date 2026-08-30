"use client";


import { useRouter } from "next/navigation";
import { useAuthentication } from "../providers/context/AuthContext";
import { useRef, useState } from "react";
import { pb } from "@/hooks/useAuth";
import { ClientResponseError } from "pocketbase";
import Link from "next/link";
import { ArrowLeft, Camera, Loader2, LogOut, User, Lock } from "lucide-react";
import NextImage from "next/image";
import { Alert } from "./Alert";

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
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

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
    <div className="min-h-screen bg-[#070707] text-white pt-24 px-4 pb-10">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Back Button */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          <span className="font-medium font-poppins">Volver al inicio</span>
        </Link>

        {/* Header Profile */}
        <div className="flex flex-col md:flex-row items-center gap-6 p-6 md:p-8 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md text-center md:text-left">
          <div className="relative group shrink-0">
            <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center border border-white/20 overflow-hidden relative">
              {uploadingAvatar ? (
                <Loader2 size={30} className="animate-spin text-[#EA1C25]" />
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
                  onClick={() => fileInputRef.current?.click()}
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
          <div className="flex-1 w-full">
            <h1 className="text-2xl md:text-3xl font-bold font-poppins truncate">
              {user?.name || user?.username || "Usuario"}
            </h1>
            <p className="text-white/60 truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 w-full md:w-auto px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors font-medium mt-2 md:mt-0"
          >
            <LogOut size={18} />
            Cerrar Sesión
          </button>
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
          <form onSubmit={handleChangePassword} className="space-y-5 max-w-md">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-white/80">
                Contraseña Actual
              </label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full px-4 py-3 bg-black/30 border border-gray-600 rounded-xl focus:outline-none focus:border-[#EA1C25] text-white transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-white/80">
                Nueva Contraseña
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 bg-black/30 border border-gray-600 rounded-xl focus:outline-none focus:border-[#EA1C25] text-white transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-white/80">
                Confirmar Nueva Contraseña
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-black/30 border border-gray-600 rounded-xl focus:outline-none focus:border-[#EA1C25] text-white transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex items-center justify-center gap-2 px-6 py-3 bg-[#EA1C25] hover:bg-[#c9171f] disabled:opacity-70 text-white font-bold rounded-xl transition-colors"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                "Actualizar Contraseña"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
