"use client";

import { useMemo, useState } from "react";
import { TALENT_NODES, type TalentNodeDefinition } from "@/game/career";
import type { DriverProfile, TalentBranch, TalentNodeId } from "@/game/types";

const BRANCHES: Array<{ id: TalentBranch; label: string; code: string; x: number }> = [
  { id: "racecraft", label: "驾驶", code: "RC", x: 150 },
  { id: "strategy", label: "策略", code: "ST", x: 450 },
  { id: "technical", label: "技术", code: "TE", x: 750 },
];

const SLOT_OFFSETS: Record<string, [number, number]> = {
  "RC-1": [-47, 68], "RC-2": [47, 68], "RC-3": [-47, 137], "RC-4": [47, 137], "RC-5": [-47, 206], "RC-6": [47, 267],
  "ST-1": [-47, 68], "ST-2": [47, 68], "ST-3": [-47, 137], "ST-4": [47, 137], "ST-5": [-47, 206], "ST-6": [47, 267],
  "TE-1": [-47, 68], "TE-2": [47, 68], "TE-3": [-47, 137], "TE-4": [47, 137], "TE-5": [-47, 206], "TE-6": [47, 267],
};

function nodePoint(node: TalentNodeDefinition): [number, number] {
  const branch = BRANCHES.find((item) => item.id === node.branch)!;
  const [offsetX, y] = SLOT_OFFSETS[node.id];
  return [branch.x + offsetX, y];
}

export function TalentTreeMap({ profile, available, onUnlock }: {
  profile: DriverProfile;
  available: TalentNodeDefinition[];
  onUnlock: (nodeId: TalentNodeId) => void;
}) {
  const selected = useMemo(() => new Set(profile.career?.selectedNodes ?? []), [profile.career?.selectedNodes]);
  const availableIds = useMemo(() => new Set(available.map((node) => node.id)), [available]);
  const initial = available.find((node) => node.active)?.id ?? profile.career?.selectedNodes.at(-1) ?? TALENT_NODES[0].id;
  const [focusedId, setFocusedId] = useState<TalentNodeId>(initial);
  const focused = TALENT_NODES.find((node) => node.id === focusedId)!;
  const canUnlock = availableIds.has(focused.id) && focused.active;
  const stateLabel = selected.has(focused.id) ? "已解锁" : !focused.active ? "赛制未启用" : canUnlock ? "可以解锁" : "前置或等级未满足";

  const selectNode = (node: TalentNodeDefinition) => setFocusedId(node.id);

  return <div className="talent-tree-map">
    <svg viewBox="0 0 900 315" role="group" aria-label="车手天赋树，分为驾驶、策略、技术三条路径">
      <g className="tree-grid" aria-hidden="true">
        {[68, 137, 206, 267].map((y, index) => <g key={y}><line x1="30" y1={y} x2="870" y2={y} /><text x="14" y={y + 3}>T{index + 1}</text></g>)}
      </g>
      {BRANCHES.map((branch) => <g className="tree-branch-label" key={branch.id}><text x={branch.x - 58} y="24">{branch.code}</text><text className="branch-name" x={branch.x - 28} y="24">{branch.label}</text><line x1={branch.x - 92} y1="35" x2={branch.x + 92} y2="35" /></g>)}
      <g className="tree-links" aria-hidden="true">
        {TALENT_NODES.flatMap((node) => node.prerequisites.map((prerequisite) => {
          const source = TALENT_NODES.find((candidate) => candidate.id === prerequisite)!;
          const [x1, y1] = nodePoint(source);
          const [x2, y2] = nodePoint(node);
          return <path className={selected.has(prerequisite) && (selected.has(node.id) || availableIds.has(node.id)) ? "active" : ""} key={`${prerequisite}-${node.id}`} d={`M ${x1} ${y1 + 18} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2 - 18}`} />;
        }))}
        {BRANCHES.map((branch) => <path key={`bus-${branch.id}`} d={`M ${branch.x} 35V285`} />)}
      </g>
      <g className="tree-nodes">
        {TALENT_NODES.map((node) => {
          const [x, y] = nodePoint(node);
          const status = selected.has(node.id) ? "selected" : !node.active ? "inactive" : availableIds.has(node.id) ? "available" : "locked";
          return <g key={node.id} role="button" tabIndex={0} aria-label={`${node.id} ${node.name}，${status === "selected" ? "已解锁" : status === "available" ? "可以解锁" : status === "inactive" ? "当前赛制未启用" : "尚未解锁"}`} aria-pressed={focusedId === node.id} className={`tree-node ${status} ${focusedId === node.id ? "focused" : ""}`} transform={`translate(${x} ${y})`} onClick={() => selectNode(node)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectNode(node); } }}>
            <path d="M0-18 21 0 0 18-21 0Z" />
            <text y="3">{node.id.split("-")[1]}</text>
            <title>{`${node.id} ${node.name}：${node.effect}`}</title>
          </g>;
        })}
      </g>
    </svg>
    <div className={`talent-node-inspector ${canUnlock ? "available" : ""}`}>
      <span>{focused.id} · {BRANCHES.find((branch) => branch.id === focused.branch)!.label} T{focused.tier}</span>
      <strong>{focused.name}</strong>
      <p>{focused.effect}</p>
      <small>{focused.prerequisites.length ? `前置：${focused.prerequisites.join(" / ")}` : "无前置节点"} · {stateLabel}</small>
      {canUnlock && <button className="button primary" onClick={() => onUnlock(focused.id)}>解锁 {focused.id}</button>}
    </div>
  </div>;
}
