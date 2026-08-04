"use client";

import { ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";

type Rect = { x: number; y: number; width: number; height: number };
type Measurement = { width: number; height: number; rects: Rect[] };

function roundedRectPath(rect: Rect, radius = 12) {
  const r = Math.min(radius, rect.width / 2, rect.height / 2);
  return [
    `M ${rect.x + r} ${rect.y}`,
    `H ${rect.x + rect.width - r}`,
    `A ${r} ${r} 0 0 1 ${rect.x + rect.width} ${rect.y + r}`,
    `V ${rect.y + rect.height - r}`,
    `A ${r} ${r} 0 0 1 ${rect.x + rect.width - r} ${rect.y + rect.height}`,
    `H ${rect.x + r}`,
    `A ${r} ${r} 0 0 1 ${rect.x} ${rect.y + rect.height - r}`,
    `V ${rect.y + r}`,
    `A ${r} ${r} 0 0 1 ${rect.x + r} ${rect.y}`,
    "Z",
  ].join(" ");
}

const floemaBridgePath = [
  "M42.9181499745395 34.03211334368865",
  "C43.52282919255975 33.10650100894232, 44.44776997213061 32.8467178280795, 45.035843783944706 33.701693306690366",
  "L45.035843783944706 10.298306693309636",
  "C44.44776997213061 11.153282171920507, 43.52282919255975 10.893498991057681, 42.9181499745395 9.96788665631135",
  "Z",
].join(" ");

function floemaLabelPath(rect: Rect, height: number) {
  const y = (height - 41.296875) / 2;
  const bottom = y + 41.296875;
  const radius = Math.min(14.0409375, rect.width / 2, 20.6484375);
  return [
    `M${rect.x} ${y + radius}`,
    `A${radius} ${radius} 0 0 1 ${rect.x + radius} ${y}`,
    `L${rect.x + rect.width - radius} ${y}`,
    `A${radius} ${radius} 0 0 1 ${rect.x + rect.width} ${y + radius}`,
    `L${rect.x + rect.width} ${bottom - radius}`,
    `A${radius} ${radius} 0 0 1 ${rect.x + rect.width - radius} ${bottom}`,
    `L${rect.x + radius} ${bottom}`,
    `A${radius} ${radius} 0 0 1 ${rect.x} ${bottom - radius}`,
    "Z",
  ].join(" ");
}

export function FloemaMetaRow({ icon, label }: { icon: ReactNode; label: ReactNode }) {
  const rowRef = useRef<HTMLSpanElement>(null);
  const nodeRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [measurement, setMeasurement] = useState<Measurement>({ width: 1, height: 44, rects: [] });

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const rowRect = row.getBoundingClientRect();
    const next = nodeRefs.current.map((node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        x: rect.left - rowRect.left,
        y: rect.top - rowRect.top,
        width: rect.width,
        height: rect.height,
      };
    }).filter((rect): rect is Rect => rect !== null);
    setMeasurement((current) => {
      if (Math.abs(current.width - rowRect.width) < 0.1 && Math.abs(current.height - rowRect.height) < 0.1 && current.rects.length === next.length && current.rects.every((rect, index) => {
        const candidate = next[index];
        return candidate && Object.keys(rect).every((key) => Math.abs(rect[key as keyof Rect] - candidate[key as keyof Rect]) < 0.1);
      })) return current;
      return { width: rowRect.width || 1, height: rowRect.height || 44, rects: next };
    });
  }, []);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    nodeRefs.current.forEach((node) => node && observer.observe(node));
    measure();
    return () => observer.disconnect();
  }, [measure]);

  const { width, height, rects } = measurement;
  const iconRect = rects[0] ?? { x: 0, y: 0, width: 44, height: 44 };
  const labelRect = rects[1] ?? { x: 44, y: 0, width: 120, height: 44 };
  const shape = roundedRectPath(iconRect, 14.96);
  const labelShape = floemaLabelPath(labelRect, height);
  const bridges = floemaBridgePath;

  return (
    <span className="floema-meta-row" ref={rowRef}>
      <svg aria-hidden="true" className="floema-meta-shape" data-meta-row-shape viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <path d={`${bridges} ${shape} ${labelShape}`} data-meta-row-shape-bridges />
      </svg>
      <span className="floema-meta-node floema-icon-side" data-meta-row-node="0" ref={(node) => { nodeRefs.current[0] = node; }}>
        <span className="floema-meta-icon">{icon}</span>
      </span>
      <span className="floema-meta-node floema-label-side" data-meta-row-node="1" ref={(node) => { nodeRefs.current[1] = node; }}>
        <span className="floema-meta-label">{label}</span>
      </span>
    </span>
  );
}
