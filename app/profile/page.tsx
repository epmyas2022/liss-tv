"use client";

import { Navbar } from "@/components/layout/Navbar";
import dynamic from "next/dynamic";

const ProfileView = dynamic(() => import("@/components/ui/ProfileView"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-10 h-10 rounded-full border-2 border-[#e50914] border-t-transparent animate-spin" />
    </div>
  ),
});

export default function ProfilePage() {
  return (
    <main className="min-h-screen bg-[#090a0c] text-white pb-24">
      <Navbar />
      <div className="pt-24 sm:pt-28">
        <ProfileView />
      </div>
    </main>
  );
}
