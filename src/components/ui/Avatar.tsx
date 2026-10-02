import type { CSSProperties } from "react";
import { initials } from "@/lib/labels";

export function teamColor(colorSlot: number | null | undefined): string {
  return colorSlot ? `var(--team-${colorSlot})` : "var(--line-strong)";
}

export function Avatar({
  name,
  colorSlot,
  size
}: {
  name: string;
  colorSlot?: number | null;
  size?: "sm" | "lg";
}) {
  return (
    <span
      className={`avatar ${size ?? ""}`}
      style={{ "--team": teamColor(colorSlot) } as CSSProperties}
      aria-hidden="true"
      title={name}
    >
      {initials(name)}
    </span>
  );
}

export function TeamDot({ colorSlot }: { colorSlot: number }) {
  return <i className="team-dot" style={{ "--team": teamColor(colorSlot) } as CSSProperties} aria-hidden="true" />;
}
