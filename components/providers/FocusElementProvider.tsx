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

  if (isMobile()) {
    return <>{children}</>;
  }

  return (
    <div
      ref={ref}
      className={`${focused ? "focus-active" : ""} ${className}`}
      style={{
        outline: focused
          ? `${strokeSize !== 0 ? `${strokeSize}px solid white` : "none"}`
          : "none",
        ...(focused && styleFocus),
      }}
    >
      {children}
    </div>
  );
}
