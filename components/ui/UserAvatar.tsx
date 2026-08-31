"use client";

import NextImage from "next/image";
import { User } from "lucide-react";
import { pb } from "@/hooks/useAuth";
import { RecordModel } from "pocketbase";

interface UserAvatarProps {
  user: RecordModel | null;
  size?: number;
}

export default function UserAvatar({ user, size = 35 }: UserAvatarProps) {
  if (user?.avatar) {
    return (
      <NextImage
        width={size}
        height={size}
        src={pb.files.getURL(user, user.avatar)}
        alt="Avatar"
        className="w-full h-full object-cover"
      />
    );
  }

  // Calculate icon size relative to container
  const iconSize = Math.max(16, size / 2);

  return <User size={iconSize} />;
}
