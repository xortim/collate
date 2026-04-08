import React, { useEffect, useImperativeHandle, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PageImage } from "./PageImage";
import { useAppStore } from "@/store";

interface PageSize {
  width_pts: number;
  height_pts: number;
}

interface Props {
  docId: number;
  pageSizes: PageSize[];
}

export interface PageViewerHandle {
  scrollToPage(index: number): void;
}

/** Gap between pages in pixels. */
const PAGE_GAP = 16;

/** Horizontal padding inside the page container (px-4 left + px-4 right). */
const PAGE_PADDING_X = 32;

/**
 * Continuous-scroll PDF viewer with virtual rendering.
 *
 * Only the pages visible in the viewport (plus a small overscan buffer) are
 * mounted. Pages that scroll out of view unmount, freeing their image data.
 * Row heights are estimated from PDF point dimensions before the image loads,
 * so the scroll bar is accurate from the start.
 *
 * Exposes `scrollToPage(index)` via ref for the sidebar to call on click.
 * Reports the topmost visible page to the zustand store on every scroll so the
 * sidebar can highlight and follow the active thumbnail.
 */
export const PageViewer = React.forwardRef<PageViewerHandle, Props>(
  function PageViewer({ docId, pageSizes }, ref) {
    const parentRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
      count: pageSizes.length,
      getScrollElement: () => parentRef.current,
      estimateSize: (i) => {
        const containerWidth = parentRef.current?.clientWidth ?? 800;
        const pageWidth = Math.max(containerWidth - PAGE_PADDING_X, 100);
        const { width_pts, height_pts } = pageSizes[i];
        return Math.round((height_pts / width_pts) * pageWidth) + PAGE_GAP;
      },
      // Render 2 pages beyond the visible area so the next page is ready
      // before the user scrolls to it.
      overscan: 2,
    });

    // estimateSize uses parentRef.current?.clientWidth which is null on the
    // first render. Calling measure() after mount resets the cache so heights
    // are recalculated with the real container width.
    useEffect(() => {
      virtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Expose scrollToPage to the parent (App) so the sidebar can drive it.
    // align:'start' puts the target page flush with the top of the viewport.
    useImperativeHandle(ref, () => ({
      scrollToPage(index) {
        virtualizer.scrollToIndex(index, { align: "start" });
      },
    }));

    // Track the topmost visible page and publish it to the store so the
    // sidebar can highlight and scroll-to-follow the active thumbnail.
    const setActivePage = useAppStore((s) => s.setActivePage);
    useEffect(() => {
      const el = parentRef.current;
      if (!el) return;
      // Fire once immediately so page 0 is marked active before the user scrolls.
      setActivePage(0);

      function onScroll() {
        const scrollTop = el!.scrollTop;
        // Use the same effective width as estimateSize so accumulated heights match.
        const pageWidth = Math.max(el!.clientWidth - PAGE_PADDING_X, 100);
        // Compute active page from page sizes directly — more reliable than
        // reading virtualizer items, which only covers the rendered window.
        let y = 0;
        let active = 0;
        for (let i = 0; i < pageSizes.length; i++) {
          const { width_pts, height_pts } = pageSizes[i];
          const h =
            Math.round((height_pts / width_pts) * pageWidth) + PAGE_GAP;
          // A page is "active" once its top edge has reached 50px below the
          // scroll position — a small grace zone so flipping is not too eager.
          if (y > scrollTop + 50) break;
          active = i;
          y += h;
        }
        setActivePage(active);
      }

      el.addEventListener("scroll", onScroll, { passive: true });
      return () => el.removeEventListener("scroll", onScroll);
    }, [pageSizes, setActivePage]);

    return (
      <div ref={parentRef} className="overflow-y-auto h-full bg-gray-200">
        {/* Spacer that gives the scrollbar the correct total height. */}
        <div
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const { width_pts, height_pts } = pageSizes[item.index];
            const containerWidth = parentRef.current?.clientWidth ?? 800;
            const pageWidth = Math.max(containerWidth - PAGE_PADDING_X, 100);

            return (
              <div
                key={item.key}
                className="absolute left-0 right-0 px-4"
                style={{ top: item.start, paddingBottom: PAGE_GAP }}
              >
                <PageImage
                  docId={docId}
                  pageIndex={item.index}
                  width={pageWidth}
                  widthPts={width_pts}
                  heightPts={height_pts}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);
