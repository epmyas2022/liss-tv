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
      className={className}
      style={{
        outline: focused ? `${strokeSize}px solid white` : "none",
        ...(focused && styleFocus),
      }}
    >
      {children}
    </div>
  );
}
