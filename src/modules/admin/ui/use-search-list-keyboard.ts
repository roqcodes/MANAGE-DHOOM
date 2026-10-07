"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseSearchListKeyboardOptions = {
  open: boolean;
  itemCount: number;
  onSelectIndex: (index: number) => void;
  onClose: () => void;
};

export function useSearchListKeyboard({
  open,
  itemCount,
  onSelectIndex,
  onClose,
}: UseSearchListKeyboardOptions) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    if (!open) setActiveIndex(-1);
  }, [open]);

  useEffect(() => {
    setActiveIndex(-1);
    itemRefs.current = [];
  }, [itemCount]);

  useEffect(() => {
    if (activeIndex < 0) return;
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const registerItemRef = useCallback((index: number, el: HTMLElement | null) => {
    itemRefs.current[index] = el;
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (!open || itemCount <= 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => {
          if (current < 0) return 0;
          return current < itemCount - 1 ? current + 1 : 0;
        });
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => {
          if (current < 0) return itemCount - 1;
          return current > 0 ? current - 1 : itemCount - 1;
        });
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(0);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(itemCount - 1);
        return;
      }

      if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        onSelectIndex(activeIndex);
      }
    },
    [activeIndex, itemCount, onClose, onSelectIndex, open],
  );

  return {
    activeIndex,
    setActiveIndex,
    registerItemRef,
    handleKeyDown,
  };
}
