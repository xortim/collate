import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  docId: number;
  pageIndex: number;
  /** Available content width in CSS pixels — from ResizeObserver in PageSidebar. */
  width: number;
  widthPts: number;
  heightPts: number;
  isActive: boolean;
  onClick(): void;
}

/**
 * A single thumbnail in the page sidebar.
 *
 * Loads the page via the collate:// protocol at the sidebar's current width.
 * Highlights when it is the active (topmost visible) page in the viewer.
 */
export function SidebarThumbnail({
  docId,
  pageIndex,
  width,
  widthPts,
  heightPts,
  isActive,
  onClick,
}: Props) {
  const [src, setSrc] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    const dpr = Math.min(window.devicePixelRatio, 3);
    const physicalWidth = Math.round(width * dpr);
    setSrc(`collate://localhost/${docId}/${pageIndex}/${physicalWidth}`);
    return () => setSrc("");
  }, [docId, pageIndex, width]);

  const aspectRatio = `${widthPts} / ${heightPts}`;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex flex-col items-center gap-1 p-2 rounded-md cursor-pointer hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive && "ring-2 ring-primary"
      )}
      aria-label={`Go to page ${pageIndex + 1}`}
      aria-current={isActive ? "true" : undefined}
    >
      <div className="w-full relative">
        {!loaded && (
          <Skeleton className="w-full rounded-sm" style={{ aspectRatio }} />
        )}
        <img
          src={src}
          alt={`Page ${pageIndex + 1}`}
          className="w-full block rounded-sm shadow-sm"
          style={{ aspectRatio, display: loaded ? "block" : "none" }}
          onLoad={() => setLoaded(true)}
        />
      </div>
      <span className="text-xs text-muted-foreground select-none">
        {pageIndex + 1}
      </span>
    </button>
  );
}
