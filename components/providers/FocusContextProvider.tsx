"use client";

import {
  FocusContext,
  useFocusable,
} from "@noriginmedia/norigin-spatial-navigation-react";
import { useEffect } from "react";

export default function FocusContextProvider({
  children,
  condition,
  trackChildren,
  isFocusBoundary,
}: {
  children: React.ReactNode;
  condition?: boolean;
  trackChildren?: boolean;
  isFocusBoundary?: boolean;
}) {
  const { ref, focusKey, focusSelf } = useFocusable({
    trackChildren,
    isFocusBoundary,
  });

  useEffect(() => {
    if (!condition) return;

    focusSelf();
  }, [condition, focusSelf]);

  return (
    <>
      <FocusContext.Provider value={focusKey}>
        <div ref={ref}>{children}</div>
      </FocusContext.Provider>
    </>
  );
}
