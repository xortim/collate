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

/** Debounces a value by `delay` ms. The initial value is returned immediately. */
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * A single thumbnail in the page sidebar.
 *
 * Loads the page via the collate:// protocol at the sidebar's current width.
 * Highlights when it is the active (topmost visible) page in the viewer.
 *
 * On sidebar resize, the old thumbnail stays visible (CSS-scaled) while the
 * debounced re-render loads, eliminating skeleton flash during dragging.
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
  const dpr = Math.min(window.devicePixelRatio, 3);
  const physicalWidth = Math.round(Math.min(width, widthPts) * dpr);
  const rawSrc = `collate://localhost/${docId}/${pageIndex}/${physicalWidth}`;
  const debouncedSrc = useDebounce(rawSrc, 150);

  const [displayedSrc, setDisplayedSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setDisplayedSrc(debouncedSrc); };
    img.src = debouncedSrc;
    return () => { cancelled = true; img.src = ""; };
  }, [debouncedSrc]);

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
        {!displayedSrc ? (
          <Skeleton className="w-full rounded-sm" style={{ aspectRatio }} />
        ) : (
          <img
            src={displayedSrc}
            alt={`Page ${pageIndex + 1}`}
            className="w-full block rounded-sm shadow-sm"
            style={{ aspectRatio }}
          />
        )}
      </div>
      <span className="text-xs leading-none text-muted-foreground select-none">
        {pageIndex + 1}
      </span>
    </button>
  );
}
