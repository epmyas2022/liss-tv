"use client";

import { useEffect } from "react";
import { init } from "@noriginmedia/norigin-spatial-navigation-core";

export default function NavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    init({
      debug: false,
      visualDebug: false,
    });

  
  }, []);

  return <>{children}</>;
}
