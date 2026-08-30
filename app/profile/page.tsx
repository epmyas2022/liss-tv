"use client";

import { Spinner } from "@/components/ui/Spinner";
import dynamic from "next/dynamic";

const ProfileView = dynamic(() => import("@/components/ui/ProfileView"), {
  ssr: false,
  loading: () => (
    <main className="min-h-screen pt-20 px-4 bg-[#070707] flex items-center justify-center">
      <Spinner size="lg" />
    </main>
  ),
});

export default function ProfilePage() {
  return <ProfileView />;
}
