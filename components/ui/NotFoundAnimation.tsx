"use client";

import { Lottie } from "lottie-react";
import notFoundAnimation from "@/public/NotFound.json";

interface NotFoundAnimationProps {
  className?: string;
}

export function NotFoundAnimation({ className = "" }: NotFoundAnimationProps) {
  return (
    <div
      className={`w-44 sm:w-52 md:w-56 aspect-square flex items-center justify-center mx-auto select-none pointer-events-none ${className}`.trim()}
    >
      <Lottie
        src={notFoundAnimation}
        loop={true}
        autoplay={true}
        className="w-full h-full"
      />
    </div>
  );
}

