import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { SidebarThumbnail } from "./SidebarThumbnail";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import { useAppStore } from "@/store";

interface PageSize {
  width_pts: number;
  height_pts: number;
}

interface Props {
  docId: number;
  pageSizes: PageSize[];
  onScrollToPage(index: number): void;
}

/** Gap between thumbnails in pixels. */
// 16px gives the active ring (ring-2 = 2px each side) clear breathing room
// without items visually touching when unselected.
const THUMBNAIL_GAP = 16;

/**
 * Virtualised thumbnail strip rendered inside the shadcn <Sidebar>.
 *
 * Width is measured via ResizeObserver so thumbnails fill the sidebar at any
 * width — including after the user resizes the window. The same ref drives
 * both the observer and the virtualizer's scroll container.
 */
export function PageSidebar({ docId, pageSizes, onScrollToPage }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [thumbnailWidth, setThumbnailWidth] = useState(120);

  // Range-select anchor — tracked in a ref to avoid re-renders.
  const anchorRef = useRef(0);

  const selectedPages = useAppStore((s) => s.selectedPages);
  const togglePageSelection = useAppStore((s) => s.togglePageSelection);
  const selectPageRange = useAppStore((s) => s.selectPageRange);
  const clearSelection = useAppStore((s) => s.clearSelection);

  const handleThumbClick = useCallback(
    (index: number, e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey) {
        togglePageSelection(index);
        anchorRef.current = index;
      } else if (e.shiftKey) {
        selectPageRange(anchorRef.current, index);
      } else {
        clearSelection();
        onScrollToPage(index);
        anchorRef.current = index;
      }
    },
    [togglePageSelection, selectPageRange, clearSelection, onScrollToPage]
  );

  // Measure available content width and update thumbnails when it changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentBoxSize[0].inlineSize;
      // w is already the content-box width (inside padding). Subtract only the
      // button's p-2 padding (8px each side = 16px) to match the image display width.
      setThumbnailWidth(Math.max(40, Math.floor(w - 16)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const thumbVirtualizer = useVirtualizer({
    count: pageSizes.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (i) => {
      const { width_pts, height_pts } = pageSizes[i];
      return (
        Math.round((height_pts / width_pts) * thumbnailWidth) +
        16 + // p-2 top + bottom padding on the button (8px each)
        20 + // page number label + gap-1
        THUMBNAIL_GAP
      );
    },
    overscan: 3,
  });

  // When the sidebar is resized, the estimated item heights are stale.
  // useLayoutEffect (not useEffect) runs before paint so positions are
  // corrected before the browser renders — prevents visible overlap.
  useLayoutEffect(() => {
    thumbVirtualizer.measure();
  }, [thumbnailWidth, thumbVirtualizer]);

  // Follow the active page in the viewer — only scrolls if out of view.
  const activePage = useAppStore((s) => s.activePage);
  useEffect(() => {
    thumbVirtualizer.scrollToIndex(activePage, { align: "auto" });
  }, [activePage, thumbVirtualizer]);

  return (
    <>
      <SidebarHeader className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border shrink-0">
        Pages
      </SidebarHeader>
      <SidebarContent className="overflow-hidden p-0">
        {/* containerRef drives both ResizeObserver and the virtualizer. */}
        <div ref={containerRef} className="h-full overflow-y-auto py-2 pl-3 pr-6">
          <div
            className="relative w-full"
            style={{ height: thumbVirtualizer.getTotalSize() }}
          >
            {thumbVirtualizer.getVirtualItems().map((item) => {
              const { width_pts, height_pts } = pageSizes[item.index];
              return (
                <div
                  key={item.key}
                  className="absolute left-0 right-0"
                  style={{ top: item.start, paddingBottom: THUMBNAIL_GAP }}
                >
                  <SidebarThumbnail
                    docId={docId}
                    pageIndex={item.index}
                    width={thumbnailWidth}
                    widthPts={width_pts}
                    heightPts={height_pts}
                    isActive={item.index === activePage}
                    isSelected={selectedPages.has(item.index)}
                    onClick={(e) => handleThumbClick(item.index, e)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </SidebarContent>
      <SidebarResizeHandle />
    </>
  );
}
