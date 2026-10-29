"use client";

import { useFocus } from "@/hooks/useFocus";
import { useCommon } from "../../hooks/useCommon";

export default function FocusElementProvider({
  children,
  className = "",
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

  const isFocused = focused && !isMobile();

  return (
    <div
      ref={ref}
      className={`${isFocused ? "focus-active " : ""}${className}`.trim()}
      style={{
        outline: isFocused
          ? strokeSize !== 0
            ? `${strokeSize}px solid white`
            : "none"
          : "none",
        ...(isFocused && styleFocus),
      }}
    >
      {children}
    </div>
  );
}
