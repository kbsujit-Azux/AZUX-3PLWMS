/**
 * ============================================================
 *  MODULE INDEX — Vision Picking AR Overlay Helpers
 * ============================================================
 *
 *  Purpose: UI helpers for hands-free vision picking mode.
 *           Draws AR-style overlays on camera preview to
 *           highlight pick locations, quantities, and status.
 *
 *  Usage:
 *    <AROverlay
 *      mode="pick"
 *      targetLocation="A12-03-B"
 *      targetQty={5}
 *      status="pending"
 *      onConfirm={handleConfirm}
 *    />
 * ============================================================
 */

import type { ReactNode } from "react";

export type ARMode = "pick" | "putaway" | "move" | "receive";

export interface AROverlayProps {
  mode: ARMode;
  targetLocation?: string;
  targetSku?: string;
  targetQty?: number;
  status?: "pending" | "confirmed" | "error";
  highlightPolygon?: Array<{ x: number; y: number }>;
  children?: ReactNode;
  onConfirm?: () => void;
}

const MODE_COLORS: Record<ARMode, string> = {
  pick: "#10b981",
  putaway: "#3b82f6",
  move: "#f59e0b",
  receive: "#8b5cf6",
};

const MODE_LABELS: Record<ARMode, string> = {
  pick: "PICK",
  putaway: "PUTAWAY",
  move: "MOVE",
  receive: "RECEIVE",
};

export function AROverlay({ mode, targetLocation, targetSku, targetQty, status, highlightPolygon, onConfirm }: AROverlayProps) {
  const color = MODE_COLORS[mode];
  const label = MODE_LABELS[mode];

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-3 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 rounded text-[10px] font-bold tracking-wider" style={{ backgroundColor: `${color}33`, color }}>
            {label}
          </span>
          {targetLocation && (
            <span className="px-2 py-1 bg-slate-800/90 text-white text-[10px] rounded font-mono">
              {targetLocation}
            </span>
          )}
        </div>
        {status === "pending" && (
          <span className="px-2 py-1 bg-amber-500/20 text-amber-400 text-[10px] rounded animate-pulse">
            PENDING
          </span>
        )}
        {status === "confirmed" && (
          <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] rounded">
            CONFIRMED
          </span>
        )}
        {status === "error" && (
          <span className="px-2 py-1 bg-red-500/20 text-red-400 text-[10px] rounded">
            ERROR
          </span>
        )}
      </div>

      {/* Center highlight box */}
      {targetLocation && status === "pending" && (
        <div className="absolute inset-x-0 top-0 bottom-0 flex items-center justify-center">
          <div className="relative w-[85%] h-[30%]">
            <div className="absolute inset-0 border-2 rounded-md" style={{ borderColor: `${color}66` }} />
            <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 rounded-tl-md" style={{ borderColor: color }} />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 rounded-tr-md" style={{ borderColor: color }} />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 rounded-bl-md" style={{ borderColor: color }} />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 rounded-br-md" style={{ borderColor: color }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="px-3 py-1.5 bg-black/70 text-white text-sm font-mono rounded" style={{ borderColor: color }}>
                {targetLocation}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom info bar */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center justify-between text-[10px] text-slate-300">
          {targetSku && <div>SKU: <span className="font-mono text-white">{targetSku}</span></div>}
          {targetQty !== undefined && <div>Qty: <span className="font-mono text-white">{targetQty}</span></div>}
        </div>
      </div>

      {/* Voice status indicator */}
      <div className="absolute top-16 right-3 flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[9px] text-emerald-400 font-medium">VOICE READY</span>
      </div>
    </div>
  );
}
