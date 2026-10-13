"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Animate the SVG coordinates, so the vehicle and circuit share one projection. */
export function MovingVehicle({ x, y, angle, label, className, onSelect, children }: {
  x: number; y: number; angle: number; label: string; className: string;
  onSelect: () => void; children: ReactNode;
}) {
  const node = useRef<SVGGElement>(null);
  const displayed = useRef({ x, y, angle });
  useLayoutEffect(() => {
    const from = { ...displayed.current };
    const turn = (((angle - from.angle + 180) % 360 + 360) % 360) - 180;
    const distance = Math.hypot(x - from.x, y - from.y);
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches || distance > 180 ? 0 : 330;
    const start = performance.now();
    let frame = 0;
    const draw = () => {
      const progress = duration ? Math.max(0, Math.min(1, (performance.now() - start) / duration)) : 1;
      const ease = 1 - (1 - progress) ** 3;
      const position = { x: from.x + (x - from.x) * ease, y: from.y + (y - from.y) * ease, angle: from.angle + turn * ease };
      displayed.current = position;
      node.current?.setAttribute("transform", `translate(${position.x} ${position.y}) rotate(${position.angle})`);
      if (progress < 1) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [x, y, angle]);
  return <g ref={node} transform={`translate(${x} ${y}) rotate(${angle})`} role="button" tabIndex={0} aria-label={label} className={className} onClick={onSelect} onKeyDown={(event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); }
  }}>{children}</g>;
}
