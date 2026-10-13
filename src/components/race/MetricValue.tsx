"use client";

import { useEffect, useRef } from "react";

/** Shows exact engine values immediately; only the change indicator is animated. */
export function MetricValue({ value, label }: { value: number; label: string }) {
  const previous = useRef(value);
  const change = useRef<HTMLElement>(null);
  useEffect(() => {
    const delta = value - previous.current;
    previous.current = value;
    const node = change.current;
    if (!node || delta === 0) return;
    node.textContent = delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
    const animation = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? node.animate([{ opacity: 1 }, { opacity: 1, offset: .7 }, { opacity: 0 }], { duration: 1800 })
      : undefined;
    const timer = window.setTimeout(() => { node.textContent = ""; }, 1800);
    return () => { window.clearTimeout(timer); animation?.cancel(); node.textContent = ""; };
  }, [value]);
  return <b className="metric-value" aria-label={`${label} ${value}`}><b>{value}</b><small ref={change} aria-hidden="true" /></b>;
}
