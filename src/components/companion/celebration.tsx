"use client";

import { PartyPopper } from "lucide-react";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/** Confetti directions (px) and colours; fixed so every burst looks the same. */
const CONFETTI = [
  { dx: 20, dy: -18, className: "bg-primary" },
  { dx: -18, dy: -20, className: "bg-warning" },
  { dx: 26, dy: 4, className: "bg-success" },
  { dx: -24, dy: 6, className: "bg-[#e87ba4]" },
  { dx: 6, dy: -28, className: "bg-warning" },
  { dx: -6, dy: 22, className: "bg-primary/70" },
  { dx: 16, dy: 20, className: "bg-[#e87ba4]" },
];

interface Burst {
  id: number;
  x: number;
  y: number;
}

/** A congratulation badge that pops up from a point and floats away, with a confetti burst. */
function CelebrationPop({ x, y }: { x: number; y: number }) {
  return (
    <span aria-hidden="true" className="pointer-events-none fixed z-[60]" style={{ left: x, top: y }}>
      {CONFETTI.map((piece, index) => (
        <span
          key={index}
          className={cn("absolute top-0 left-0 size-2 animate-celebrate-confetti rounded-full", piece.className)}
          style={{ "--dx": `${piece.dx}px`, "--dy": `${piece.dy}px` } as React.CSSProperties}
        />
      ))}
      <span className="absolute top-0 left-0 flex size-8 animate-celebrate-pop items-center justify-center rounded-full bg-card text-[#ee9a1c] shadow-md ring-1 ring-border">
        <PartyPopper className="size-[18px]" strokeWidth={2.2} />
      </span>
    </span>
  );
}

/**
 * Small celebrations for finished things. `celebrate(element)` pops a congratulation badge
 * from that element; render `celebrations` anywhere in the component. Purely decorative —
 * pair it with a toast or status text for screen readers. Hidden for reduced motion.
 */
export function useCelebration() {
  const [bursts, setBursts] = useState<Burst[]>([]);

  const celebrate = useCallback((element: Element | null) => {
    if (!element || typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const rect = element.getBoundingClientRect();
    const id = Date.now() + Math.random();
    setBursts((current) => [...current, { id, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }]);
    window.setTimeout(() => setBursts((current) => current.filter((burst) => burst.id !== id)), 1300);
  }, []);

  const celebrations =
    bursts.length > 0 && typeof document !== "undefined"
      ? createPortal(
          bursts.map((burst) => <CelebrationPop key={burst.id} x={burst.x} y={burst.y} />),
          document.body,
        )
      : null;

  return { celebrate, celebrations };
}
