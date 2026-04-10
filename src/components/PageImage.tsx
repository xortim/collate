import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/useDebounce";

interface Props {
  docId: number;
  pageIndex: number;
  /** Container width in CSS pixels — multiplied by devicePixelRatio for pdfium. */
  width: number;
  /** Page aspect ratio for the loading placeholder. */
  widthPts: number;
  heightPts: number;
}

/**
 * Loads and displays a single PDF page via the collate:// URI scheme protocol.
 *
 * The protocol handler rasterises the page and returns a BMP image (~0.3 ms
 * encode cost vs ~8 ms for JPEG). Using <img src> rather than fetch() bypasses
 * WKWebView's CORS restrictions on custom schemes — image loads are always
 * same-origin from the browser's perspective.
 *
 * URL: collate://localhost/{docId}/{pageIndex}/{physicalWidth}
 *
 * Lifecycle:
 *   mount            → skeleton placeholder shown
 *   first load       → image swapped in, skeleton gone forever
 *   zoom/resize      → old image stays visible (CSS-scaled to new size) while
 *                      the debounced re-render loads; no skeleton flash
 *   unmount          → inflight load cancelled
 */
export function PageImage({ docId, pageIndex, width, widthPts, heightPts }: Props) {
  // Cap at 3x: covers Retina (2x) and high-density mobile/pro displays (3x)
  // without unbounded render costs on future hardware. Beyond 3x the visual
  // difference is imperceptible for PDF text at normal viewing distance.
  const dpr = Math.min(window.devicePixelRatio, 3);
  // Cap at the page's natural PDF width × DPR. At 100% zoom width ≈ widthPts
  // so no cap applies. Above 100% zoom (width > widthPts) the cap kicks in,
  // preventing pdfium from rasterising at multiples of the natural resolution.
  // At 300% zoom on Retina this reduces render area 9× with no perceptible
  // quality loss — the browser simply scales the image up via CSS as it would
  // any other high-DPI asset.
  const physicalWidth = Math.round(Math.min(width, widthPts) * dpr);
  const rawSrc = `collate://localhost/${docId}/${pageIndex}/${physicalWidth}`;

  // Debounce URL changes so rapid zoom/resize gestures don't flood the backend
  // with redundant renders. 150 ms is imperceptible for discrete button clicks
  // but eliminates most mid-gesture render requests.
  const debouncedSrc = useDebounce(rawSrc, 150);

  const [displayedSrc, setDisplayedSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setDisplayedSrc(debouncedSrc); };
    img.onerror = () => { if (!cancelled) setError("Failed to render"); };
    img.src = debouncedSrc;
    return () => { cancelled = true; img.src = ""; };
  }, [debouncedSrc]);

  const aspectRatio = `${widthPts} / ${heightPts}`;

  if (error && !displayedSrc) {
    return (
      <div
        className="w-full border border-destructive/30 bg-destructive/5 flex items-center justify-center text-destructive text-sm rounded-md"
        style={{ aspectRatio }}
      >
        Page {pageIndex + 1}: {error}
      </div>
    );
  }

  if (!displayedSrc) {
    return (
      <Skeleton
        className="w-full rounded-md"
        style={{ aspectRatio }}
        aria-label={`Loading page ${pageIndex + 1}`}
      />
    );
  }

  return (
    <img
      src={displayedSrc}
      alt={`Page ${pageIndex + 1}`}
      className="w-full shadow-sm block rounded-md select-none"
      style={{ aspectRatio }}
    />
  );
}
