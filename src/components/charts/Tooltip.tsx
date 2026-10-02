"use client";

import { useCallback, useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";

interface TooltipState {
  x: number;
  y: number;
  content: ReactNode;
}

/**
 * One floating tooltip per chart. Marks call `bind(content)` to get pointer and focus
 * handlers; the same details show on hover and on keyboard focus.
 */
export function useChartTooltip() {
  const [state, setState] = useState<TooltipState | null>(null);

  const bind = useCallback(
    (content: ReactNode) => ({
      onPointerMove: (event: PointerEvent<HTMLElement>) => setState({ x: event.clientX, y: event.clientY, content }),
      onPointerLeave: () => setState(null),
      onFocus: (event: FocusEvent<HTMLElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setState({ x: rect.left + rect.width / 2, y: rect.top, content });
      },
      onBlur: () => setState(null)
    }),
    []
  );

  const tooltip = state ? (
    <div className="viz-tooltip" role="tooltip" style={{ left: state.x, top: state.y }}>
      {state.content}
    </div>
  ) : null;

  return { bind, tooltip };
}
