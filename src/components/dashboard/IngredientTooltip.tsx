"use client";

import { useState } from "react";
import type { MouseEvent } from "react";
import { getIngredientDescription } from "@/lib/ingredient-descriptions";

type Props = {
  label: string;
  children: React.ReactNode;
};

type Position = { x: number; y: number };

export function IngredientTooltip({ label, children }: Props) {
  const desc = getIngredientDescription(label);
  const [pos, setPos] = useState<Position | null>(null);

  if (!desc) return <>{children}</>;

  const handleMouseEnter = (e: MouseEvent) => {
    setPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: MouseEvent) => {
    setPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setPos(null);
  };

  return (
    <>
      <span
        className="ingredient-tooltip-anchor"
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </span>
      {pos && (
        <span
          className="ingredient-tooltip"
          role="tooltip"
          style={{ left: pos.x + 14, top: pos.y - 8 }}
        >
          <span className="ingredient-tooltip-summary">{desc.summary}</span>
          <span className="ingredient-tooltip-functions">
            {desc.functions.map((fn) => (
              <em key={fn}>{fn}</em>
            ))}
          </span>
        </span>
      )}
    </>
  );
}
