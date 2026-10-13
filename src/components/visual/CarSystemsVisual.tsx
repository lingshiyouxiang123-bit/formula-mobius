import { useId, type CSSProperties } from "react";
import type { CarStats } from "@/game/types";

const clampLevel = (value: number) => Math.max(0, Math.min(5, value));

// Rear is left, nose is right. Wheels, brakes, suspension and leaders share these datums.
const carOrigin = { x: 450, y: 156 };
const axles = [{ x: -145, halfTrack: 72, length: 58, width: 36 }, { x: 143, halfTrack: 72, length: 54, width: 34 }];
const systems = [
  { key: "eng", label: "ENG", className: "engine", anchor: [-64, -12], elbow: [228, 105], text: [126, 90] },
  { key: "rel", label: "REL", className: "reliability", anchor: [-22, 0], elbow: [474, 65], text: [484, 62] },
  { key: "aero", label: "AERO", className: "aero", anchor: [222, -68], elbow: [765, 88], text: [776, 78] },
  { key: "mech", label: "MECH", className: "mechanical", anchor: [axles[0].x, 51], elbow: [228, 236], text: [126, 232] },
  { key: "brk", label: "BRK", className: "brakes", anchor: [axles[1].x, axles[1].halfTrack - axles[1].width / 2 - 3], elbow: [765, 236], text: [776, 232] },
] as const;

export function CarSystemsVisual({ stats, color, name }: { stats: CarStats; color: string; name: string }) {
  const id = useId().replace(/:/g, "");
  const total = Object.values(stats).reduce((sum, value) => sum + value, 0);
  const style = {
    "--car-team-color": color,
    "--aero-level": clampLevel(stats.aero) / 5,
    "--engine-level": clampLevel(stats.eng) / 5,
    "--mechanical-level": clampLevel(stats.mech) / 5,
    "--brake-level": clampLevel(stats.brk) / 5,
    "--reliability-level": clampLevel(stats.rel) / 5,
  } as CSSProperties;

  return <section className="car-systems-visual" style={style} aria-label={`${name} 赛车系统图，性能指数 ${total}/15`}>
    <header><span>CAR SYSTEMS / PI {total}</span><strong>{name}</strong><small>ENG {stats.eng} · AERO {stats.aero} · MECH {stats.mech} · BRK {stats.brk} · REL {stats.rel}</small></header>
    <div className="car-systems-stage">
      <svg viewBox="0 0 900 280" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e5f0f5" stopOpacity=".7" /><stop offset=".12" stopColor={color} />
            <stop offset=".45" stopColor={color} /><stop offset=".7" stopColor="#172127" /><stop offset="1" stopColor={color} stopOpacity=".65" />
          </linearGradient>
          <linearGradient id={`${id}-tyre`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#07090b" /><stop offset=".2" stopColor="#252a30" /><stop offset=".5" stopColor="#111418" /><stop offset=".8" stopColor="#252a30" /><stop offset="1" stopColor="#07090b" />
          </linearGradient>
          <pattern id={`${id}-carbon`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <rect width="5" height="5" fill="#10161b" /><path d="M0 0V5" stroke="#29323b" strokeWidth="1" />
          </pattern>
        </defs>

        <g className="engineering-grid">
          {[90, 180, 270, 360, 450, 540, 630, 720, 810].map((x) => <line key={`x-${x}`} x1={x} y1="22" x2={x} y2="258" />)}
          {[60, 108, 156, 204, 252].map((y) => <line key={`y-${y}`} x1="24" y1={y} x2="876" y2={y} />)}
        </g>
        <g className="airflow">
          <path pathLength="1" d="M35 74C175 36 273 42 366 56S603 63 865 65" />
          <path pathLength="1" d="M25 122C143 92 186 105 237 124" />
          <path pathLength="1" d="M25 190C143 220 186 207 237 188" />
          <path pathLength="1" d="M35 238C175 276 273 270 366 256S603 249 865 247" />
        </g>

        <g className="car-plan" transform={`translate(${carOrigin.x} ${carOrigin.y})`}>
          <path className="centerline" d="M-252 0H254" />
          <path className="floor" fill={`url(#${id}-carbon)`} d="M-171-22-136-34-112-47Q-83-57-26-58L56-57 83-49 101-39 76-36 70-19H-141V19H70L76 36 101 39 83 49 56 57-26 58Q-83 57-112 47L-136 34-171 22Z" />
          <g className="diffuser">
            <path d="M-182-32-142-25V25L-182 32Z" />
            {[-24, -12, 0, 12, 24].map((y) => <path key={y} d={`M-181 ${y}L-146 ${y * .7}`} />)}
          </g>
          <g className="suspension">
            {axles.map((axle) => [-1, 1].map((side) => <g key={`${axle.x}-${side}`}>
              <path d={`M${axle.x - 26} ${side * 19}L${axle.x} ${side * 55}L${axle.x + 30} ${side * 22}`} />
              <path className="pushrod" d={`M${axle.x - 12} ${side * 12}L${axle.x + 5} ${side * 55}`} />
              <path className="trackrod" d={`M${axle.x + 24} ${side * 14}L${axle.x + 15} ${side * 55}`} />
            </g>))}
          </g>

          <g className="rear-wing">
            <path className="wing-mount" d="M-167-8H-209M-167 8H-209" />
            <path className="wing-surface" fill={`url(#${id}-body)`} d="M-224-60Q-211-66-196-62L-196 62Q-211 66-224 60Z" />
            <path className="wing-seam" d="M-215-60V60M-206-62V62" />
            {[-1, 1].map((side) => <path className="wing-endplate" key={side} d={`M-229 ${side * 63}H-191L-194 ${side * 58}H-225Z`} />)}
          </g>
          <g className="front-wing">
            {[-1, 1].map((side) => <g key={side} transform={`scale(1 ${side})`}>
              <path className="wing-surface" fill={`url(#${id}-body)`} d="M206 7Q203 30 191 59L192 81Q206 87 225 82L232 23 234 6Z" />
              <path className="wing-seam" d="M212 10Q208 44 201 80M220 10Q220 43 211 83M229 14Q230 49 221 82" />
              <path className="wing-endplate" d="M190 81Q207 88 228 83L226 78Q204 82 192 77Z" />
            </g>)}
          </g>

          <g className="body" fill={`url(#${id}-body)`}>
            <path className="engine-cover" d="M-183-7-152-14Q-111-17-63-25L-20-28 12-22 14 22-20 28-63 25Q-111 17-152 14L-183 7Z" />
            {[-1, 1].map((side) => <g key={side} transform={`scale(1 ${side})`}>
              <path className="sidepod" d="M-133 24Q-82 27-35 44L22 46Q47 46 60 32L61 23 14 20Q-12 21-37 25L-83 21Z" />
              <path className="sidepod-highlight" d="M-116 25Q-61 32-34 42L18 43Q38 43 51 35" />
              <path className="intake" d="M43 25 61 23 60 32 47 37 40 35Z" />
              <path className="floor-edge" d="M-122 45Q-74 53-24 53H52L79 45M-115 40-102 47M-105 37-91 48" />
              {[-40, -30, -20, -10, 0].map((x) => <path className="cooling-louvre" key={x} d={`M${x} 28l-3 9`} />)}
              <path className="mirror-stalk" d="M57 19 65 40H73" />
              <rect className="mirror" x="69" y="37" width="13" height="6" rx="2" />
            </g>)}
            <path className="monocoque" d="M-7-22Q28-29 63-22L91-13 163-8 218-5Q232 0 218 5L163 8 91 13 63 22Q28 29-7 22Z" />
          </g>
          <path className="paint-stripe" d="M-174-2H-53L-27-5H-8M87-2H213M87 2H213" />
          <path className="power-unit" d="M-103-10-45-17-30-11V11L-45 17-103 10Z" />
          <path className="engine-spine" d="M-157 0H-49" />
          <circle className="reliability-core" cx="-22" cy="0" r="5" />
          <path className="cockpit" d="M1-16Q21-21 51-15Q68-11 72 0Q68 11 51 15Q21 21 1 16Z" />
          <path className="seat" d="M10-9H28Q36 0 28 9H10Z" />
          <path className="halo" d="M-1-18Q29-27 58-17Q73-11 74 0Q73 11 58 17Q29 27-1 18M74 0H57" />
          <rect className="airbox" x="-11" y="-10" width="14" height="20" rx="4" />
          <path className="nose-seam" d="M94-8 156-5H201M94 8 156 5H201" />

          {axles.map((axle) => [-1, 1].map((side) => <g className="wheel-assembly" key={`${axle.x}-${side}`} transform={`translate(${axle.x} ${side * axle.halfTrack})`}>
            <rect className="wheel" fill={`url(#${id}-tyre)`} x={-axle.length / 2} y={-axle.width / 2} width={axle.length} height={axle.width} rx="9" />
            <path className="tyre-shoulder" d={`M${-axle.length / 2 + 6} ${-axle.width / 2 + 4}H${axle.length / 2 - 6}M${-axle.length / 2 + 6} ${axle.width / 2 - 4}H${axle.length / 2 - 6}`} />
            <path className="tyre-mark" d={`M-10 ${-axle.width / 2 + 1}H10M-10 ${axle.width / 2 - 1}H10`} />
            <rect className="wheel-hub" x="-9" y={side < 0 ? axle.width / 2 - 3 : -axle.width / 2 - 4} width="18" height="7" rx="2" />
            <rect className="brake-disc" x="-8" y={side < 0 ? axle.width / 2 : -axle.width / 2 - 6} width="16" height="6" rx="2" />
          </g>))}
        </g>

        <g className="system-callouts">
          {systems.map(({ key, label, className, anchor, elbow, text }) => {
            const x = carOrigin.x + anchor[0], y = carOrigin.y + anchor[1];
            return <g className={`callout ${className}`} key={key}>
              <path d={`M${x} ${y}H${elbow[0]}V${elbow[1]}`} />
              <circle cx={x} cy={y} r="3" />
              <text x={text[0]} y={text[1]}>{label}</text><text className="value" x={text[0]} y={text[1] + 17}>{stats[key]}/5</text>
            </g>;
          })}
        </g>
      </svg>
    </div>
  </section>;
}
