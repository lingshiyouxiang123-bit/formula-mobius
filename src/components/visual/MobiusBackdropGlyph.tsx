"use client";

import { useEffect, useRef } from 'react';

// A half-twisted strip with a rotating 3D projection, not a flat spinning SVG.
// Only the directory mounts it; no textures or additional WebGL context.
type Point = { x: number; y: number; z: number };
function point(u: number, v: number, angle = 0): Point {
  const radius = 1 + v * Math.cos(u / 2);
  const rawX = radius * Math.cos(u), y = radius * Math.sin(u), rawZ = v * Math.sin(u / 2);
  const x = rawX * Math.cos(angle) + rawZ * Math.sin(angle);
  const z = -rawX * Math.sin(angle) + rawZ * Math.cos(angle);
  const tilt = .94, turn = -.24;
  const py = y * Math.cos(tilt) - z * Math.sin(tilt);
  const pz = y * Math.sin(tilt) + z * Math.cos(tilt);
  const px = x * Math.cos(turn) - py * Math.sin(turn);
  const sy = x * Math.sin(turn) + py * Math.cos(turn);
  const perspective = 1 / (1 - pz * .18);
  return { x: 500 + px * perspective * 300, y: 360 + sy * perspective * 300, z: pz };
}
const xy = (p: Point) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
const line = (v: number, turns = 2, angle = 0) => Array.from({ length: 145 }, (_, i) => point(i / 144 * Math.PI * turns, v, angle)).map((p, i) => `${i ? 'L' : 'M'}${xy(p)}`).join(' ') + 'Z';
const faces = Array.from({ length: 64 }, (_, i) => {
  const u = i / 64 * Math.PI * 2, next = (i + 1) / 64 * Math.PI * 2;
  const vertices = [point(u, -.32), point(next, -.32), point(next, .32), point(u, .32)];
  return { u, next, vertices, depth: vertices.reduce((sum, p) => sum + p.z, 0) / 4, red: Math.sin(u / 2 + .65) > .6 };
}).sort((a, b) => a.depth - b.depth);
const crossLines = Array.from({ length: 48 }, (_, i) => {
  const u = i / 48 * Math.PI * 2;
  return { start: point(u, -.32), end: point(u, .32) };
});

export function MobiusBackdropGlyph({ className = '' }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const polygons = [...svg.querySelectorAll<SVGPolygonElement>('.mobius-strip-faces polygon')];
    const cross = [...svg.querySelectorAll<SVGPathElement>('.mobius-strip-cross path')];
    const curves = [...svg.querySelectorAll<SVGPathElement>('.mobius-strip-lines path')];
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false, frame = 0, last = 0, angle = 0;
    const draw = () => {
      const projected = faces.map((face, i) => {
        const vertices = [point(face.u, -.32, angle), point(face.next, -.32, angle), point(face.next, .32, angle), point(face.u, .32, angle)];
        const depth = vertices.reduce((sum, p) => sum + p.z, 0) / 4;
        polygons[i].setAttribute('points', vertices.map(xy).join(' '));
        polygons[i].setAttribute('opacity', String(.08 + (depth + 1.4) * .055));
        return { node: polygons[i], depth };
      }).sort((a, b) => a.depth - b.depth);
      projected.forEach(({ node }, i) => { if (node.parentNode?.children[i] !== node) node.parentNode?.insertBefore(node, node.parentNode.children[i] ?? null); });
      cross.forEach((node, i) => { const u = i / 48 * Math.PI * 2; node.setAttribute('d', `M${xy(point(u, -.32, angle))}L${xy(point(u, .32, angle))}`); });
      curves.forEach((node, i) => node.setAttribute('d', line(i < 4 ? [.08, .16, .24, .32][i] : 0, i < 4 ? 4 : 2, angle)));
    };
    const tick = (now: number) => {
      if (!visible || document.hidden || preference.matches) return;
      if (!last || now - last >= 50) { angle += last ? Math.min(.12, (now - last) / 1000) * .18 : 0; last = now; draw(); }
      frame = requestAnimationFrame(tick);
    };
    const update = () => { cancelAnimationFrame(frame); last = 0; if (preference.matches) { angle = 0; draw(); } else if (visible && !document.hidden) frame = requestAnimationFrame(tick); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer.observe(svg);
    document.addEventListener('visibilitychange', update);
    preference.addEventListener('change', update);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', update); preference.removeEventListener('change', update); };
  }, []);
  return <svg ref={ref} className={`mobius-backdrop-glyph ${className}`} viewBox="0 0 1000 720" aria-hidden="true" focusable="false">
    <g className="mobius-strip-faces">{faces.map((face, i) => <polygon key={i} points={face.vertices.map(xy).join(' ')} fill={face.red ? '#f24b63' : '#5479ff'} opacity={.08 + (face.depth + 1.4) * .055} />)}</g>
    <g className="mobius-strip-cross">{crossLines.map(({ start, end }, i) => <path key={i} d={`M${xy(start)}L${xy(end)}`} />)}</g>
    <g className="mobius-strip-lines">{[.08, .16, .24, .32].map((v, i) => <path key={v} d={line(v, 4)} className={i % 2 ? 'blue' : 'red'} />)}<path className="center" d={line(0)} /></g>
  </svg>;
}
