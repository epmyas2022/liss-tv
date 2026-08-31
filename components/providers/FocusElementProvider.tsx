"use client";

import { useFocus } from "@/hooks/useFocus";
import { useCommon } from "../../hooks/useCommon";

export default function FocusElementProvider({
  children,
  className,
  onEnterPress,
  strokeSize = 2,
  styleFocus = {},
}: {
  children: React.ReactNode;
  onEnterPress?: VoidFunction;
  className?: string;
  strokeSize?: number;
  styleFocus?: React.CSSProperties;
}) {
  const { isMobile } = useCommon();
  const { ref, focused } = useFocus({ onEnterPress: onEnterPress });

  return (
    <div
      ref={ref}
      className={`${focused && !isMobile() ? "focus-active" : ""} ${isMobile() ? "" : className}`}
      style={{
        outline:
          focused && !isMobile()
            ? `${strokeSize !== 0 ? `${strokeSize}px solid white` : "none"}`
            : "none",
        ...(focused && !isMobile() && styleFocus),
      }}
    >
      {children}
    </div>
  );
}
