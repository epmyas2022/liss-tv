"use client";

import {
  FocusContext,
  useFocusable,
} from "@noriginmedia/norigin-spatial-navigation-react";
import { useEffect } from "react";

export default function FocusContextProvider({
  children,
  condition,
}: {
  children: React.ReactNode;
  condition?: boolean;
}) {
  const { ref, focusKey, focusSelf } = useFocusable();

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
