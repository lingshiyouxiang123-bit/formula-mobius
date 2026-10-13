import type { Track } from "@/game/types";

export function CircuitProjection({ track }: { track: Track }) {
  const circuitPath = `M ${track.mapPoints.map((point) => point.join(" ")).join(" L ")} Z`;
  const pitEntry = track.mapPoints[track.pitEntryCell];
  const pitExit = track.mapPoints[track.pitExitCell];
  const pitControl: [number, number] = [Math.min(...track.mapPoints.map((point) => point[0])) - 38, Math.max(pitEntry[1], pitExit[1]) + 30];

  return (
    <div className="circuit-projection" aria-hidden="true">
      <div className="projection-label"><span>赛道预览</span><strong>{track.name}</strong><small>{track.laps} 圈 · {track.totalLength} 格</small></div>
      <div className="projection-stage">
        <svg viewBox="25 30 650 385" preserveAspectRatio="xMidYMid meet">
          <defs><filter id="circuit-glow"><feGaussianBlur stdDeviation="6" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
          {[30, 24, 18, 12, 6].map((offset) => <path key={offset} className="circuit-depth" d={circuitPath} transform={`translate(0 ${offset})`} />)}
          <path className="circuit-deck" d={circuitPath} />
          <path className="circuit-line" d={circuitPath} pathLength="100" />
          {track.mapPoints.map(([x, y], index) => <circle className="circuit-cell" key={index} cx={x} cy={y} r={index === 0 ? 7 : 3.2} />)}
          <path className="pit-link" d={`M ${pitEntry[0]} ${pitEntry[1]} Q ${pitControl[0]} ${pitControl[1]} ${pitExit[0]} ${pitExit[1]}`} />
          <circle className="race-tracer" r="8" filter="url(#circuit-glow)"><animateMotion dur="5.6s" repeatCount="indefinite" path={circuitPath} /></circle>
        </svg>
      </div>
    </div>
  );
}
