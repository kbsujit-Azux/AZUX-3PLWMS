/**
 * ============================================================
 *  MODULE INDEX — AZUX brand mark
 * ============================================================
 *
 *  Purpose: A self-contained, print-safe company logo used on the
 *           client-facing documents (inbound receipt, close report).
 *           It is inline SVG rather than an image file so it stays
 *           crisp when printed and never breaks on a missing asset.
 *
 *  Usage:
 *    <AzuxLogo className="h-10 w-10" />        mark only
 *    <AzuxLogo variant="full" />                mark + wordmark
 * ============================================================
 */

export function AzuxLogo({
  className = "h-9 w-9",
  variant = "mark",
  tone = "light",
}: {
  className?: string;
  /** "mark" = the glyph only, "full" = glyph + wordmark */
  variant?: "mark" | "full";
  /** "light" for a white background, "dark" for a dark header band */
  tone?: "light" | "dark";
}) {
  const text = tone === "dark" ? "text-white" : "text-slate-900";
  const sub = tone === "dark" ? "text-white/70" : "text-slate-500";
  const plate = tone === "dark" ? "bg-white" : "bg-slate-900";

  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 48 48" className={className} role="img" aria-label="AZUX 3PL">
        <rect width="48" height="48" rx="10" className={plate} />
        {/* warehouse / dock glyph */}
        <path
          d="M10 21 L24 12 L38 21"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13 23v11M19 23v11M24 23v11M29 23v11M35 23v11"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path d="M10 37h28" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      {variant === "full" && (
        <div className="leading-tight">
          <div className={`text-lg font-bold tracking-tight ${text}`}>AZUX 3PL</div>
          <div className={`text-[9px] uppercase tracking-[0.18em] ${sub}`}>WMS Systems</div>
        </div>
      )}
    </div>
  );
}
