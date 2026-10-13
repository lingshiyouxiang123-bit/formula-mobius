export function lanePoint(
  points: ReadonlyArray<readonly [number, number]>,
  cell: number,
  lane: "left" | "right",
  stack = 0,
): [number, number] {
  const count = points.length;
  const previous = points[(cell - 1 + count) % count];
  const current = points[cell];
  const next = points[(cell + 1) % count];
  const incomingLength = Math.hypot(current[0] - previous[0], current[1] - previous[1]) || 1;
  const outgoingLength = Math.hypot(next[0] - current[0], next[1] - current[1]) || 1;
  let tangentX = (current[0] - previous[0]) / incomingLength + (next[0] - current[0]) / outgoingLength;
  let tangentY = (current[1] - previous[1]) / incomingLength + (next[1] - current[1]) / outgoingLength;
  const tangentLength = Math.hypot(tangentX, tangentY) || 1;
  tangentX /= tangentLength;
  tangentY /= tangentLength;
  const signedArea = points.reduce((sum, point, index) => {
    const after = points[(index + 1) % count];
    return sum + point[0] * after[1] - after[0] * point[1];
  }, 0);
  const inwardSide = signedArea >= 0 ? 1 : -1;
  const laneOffset = (lane === "left" ? 1 : -1) * inwardSide * 10;
  return [
    current[0] - tangentY * laneOffset + tangentX * stack * 7,
    current[1] + tangentX * laneOffset + tangentY * stack * 7,
  ];
}

export function startingGridPoint(
  points: ReadonlyArray<readonly [number, number]>,
  lane: "left" | "right",
  qualifyingRank: number,
  rowSpacing = 28,
): [number, number] {
  if (points.length < 2) return [0, 0];
  const start = points[0];
  const previous = points[points.length - 1];
  const directionX = start[0] - previous[0];
  const directionY = start[1] - previous[1];
  const directionLength = Math.hypot(directionX, directionY) || 1;
  const row = Math.floor((Math.max(1, qualifyingRank) - 1) / 2);
  const base = lanePoint(points, 0, lane);
  return [
    base[0] - directionX / directionLength * row * rowSpacing,
    base[1] - directionY / directionLength * row * rowSpacing,
  ];
}
