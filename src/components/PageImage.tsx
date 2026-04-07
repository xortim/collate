import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  docId: number;
  pageIndex: number;
  /** Render width in CSS pixels — drives pdfium resolution. */
  width: number;
  /** Page aspect ratio for the loading placeholder. */
  widthPts: number;
  heightPts: number;
}

/**
 * Loads and displays a single PDF page image.
 *
 * Lifecycle:
 *   mount   → fire get_page_image, show skeleton placeholder
 *   loaded  → display <img>
 *   unmount → cancel inflight request (ignore result), clear src to free memory
 */
export function PageImage({ docId, pageIndex, width, widthPts, heightPts }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setError(null);

    invoke<string>("get_page_image", { docId, pageIndex, width })
      .then((data) => {
        if (!cancelled) setSrc(`data:image/png;base64,${data}`);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });

    return () => {
      cancelled = true;
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

  if (!src) {
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
      src={src}
      alt={`Page ${pageIndex + 1}`}
      className="w-full shadow-sm block rounded-md"
      style={{ aspectRatio }}
    />
  );
}
