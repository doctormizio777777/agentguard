"use client";

import { useEffect, useRef, useState } from "react";

import { countUpValue } from "./dashboard-utils";


const COUNT_UP_DURATION_MS = 600;


export function useCountUp(target: number | null, active = true): { value: number | null; revision: number } {
  const [value, setValue] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const animated = useRef(false);
  const previousTarget = useRef<number | null>(null);

  useEffect(() => {
    if (target === null || !active) return;

    if (animated.current) {
      if (previousTarget.current !== target) {
        previousTarget.current = target;
        setValue(target);
        setRevision((current) => current + 1);
      }
      return;
    }

    animated.current = true;
    previousTarget.current = target;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }

    const duration = COUNT_UP_DURATION_MS;
    const startedAt = performance.now();
    let frame = 0;
    const update = (now: number) => {
      const progress = (now - startedAt) / duration;
      setValue(countUpValue(target, progress));
      if (progress < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    const fallback = setTimeout(() => setValue(target), COUNT_UP_DURATION_MS + 100);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(fallback);
    };
  }, [active, target]);

  return { value, revision };
}
