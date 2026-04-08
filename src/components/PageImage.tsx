import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

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
 *   mount   → set img src, show skeleton placeholder
 *   loaded  → display image (onLoad)
 *   unmount → clear src to cancel any inflight load
 */
export function PageImage({ docId, pageIndex, width, widthPts, heightPts }: Props) {
  const [src, setSrc] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoaded(false);
    setError(null);

    // Cap at 3x: covers Retina (2x) and high-density mobile/pro displays (3x)
    // without unbounded render costs on future hardware. Beyond 3x the visual
    // difference is imperceptible for PDF text at normal viewing distance.
    const dpr = Math.min(window.devicePixelRatio, 3);
    const physicalWidth = Math.round(width * dpr);
    setSrc(`collate://localhost/${docId}/${pageIndex}/${physicalWidth}`);

    return () => {
      setSrc(""); // cancels any inflight image load
    };
  }, [docId, pageIndex, width]);

  const aspectRatio = `${widthPts} / ${heightPts}`;

  if (error) {
    return (
      <div
        className="w-full border border-destructive/30 bg-destructive/5 flex items-center justify-center text-destructive text-sm rounded-md"
        style={{ aspectRatio }}
      >
        Page {pageIndex + 1}: {error}
      </div>
    );
  }

  return (
    <>
      {!loaded && (
        <Skeleton
          className="w-full rounded-md"
          style={{ aspectRatio }}
          aria-label={`Loading page ${pageIndex + 1}`}
        />
      )}
      <img
        src={src}
        alt={`Page ${pageIndex + 1}`}
        className="w-full shadow-sm block rounded-md select-none"
        style={{ aspectRatio, display: loaded ? "block" : "none" }}
        onLoad={() => setLoaded(true)}
        onError={() => setError("Failed to render")}
      />
    </>
  );
}
