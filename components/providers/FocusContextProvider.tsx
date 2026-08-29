"use client";

import {
  FocusContext,
  useFocusable,
} from "@noriginmedia/norigin-spatial-navigation-react";
import { useEffect } from "react";
import { useCommon } from "../../hooks/useCommon";
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
  const { isMobile } = useCommon();

  const { ref, focusKey, focusSelf } = useFocusable({
    trackChildren,
    isFocusBoundary,
  });

  useEffect(() => {
    if (!condition || isMobile()) return;

    focusSelf();
  }, [condition, focusSelf, isMobile]);

  if (isMobile()) {
    return <>{children}</>;
  }

  return (
    <>
      <FocusContext.Provider value={focusKey}>
        <div ref={ref}>{children}</div>
      </FocusContext.Provider>
    </>
  );
}
