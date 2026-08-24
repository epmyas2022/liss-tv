"use client";

import { useFocus } from "@/hooks/useFocus";

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
  const { ref, focused } = useFocus({ onEnterPress: onEnterPress });

  return (
    <div
      ref={ref}
      className={`${focused ? "focus-active" : ""} ${className}`}
      style={{
        outline: focused ? `${strokeSize !== 0 ? `${strokeSize}px solid white` : "none"}` : "none",
        ...(focused && styleFocus),
      }}
    >
      {children}
    </div>
  );
}
