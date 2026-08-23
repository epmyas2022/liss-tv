import { useFocusable } from "@noriginmedia/norigin-spatial-navigation-react";

export function useFocus({ onEnterPress }: { onEnterPress?: () => void }) {
  const { ref, focused } = useFocusable({
    onFocus: (layout) => {
      if (!layout.node) return;

      layout.node.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    },
    onEnterPress: () => {
      if (onEnterPress) {
        onEnterPress();
      }
    },
  });
  return { ref, focused };
}


