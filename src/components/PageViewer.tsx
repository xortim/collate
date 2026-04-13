import React, { useEffect, useImperativeHandle, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
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

/** Extra space above the first page — matches PAGE_GAP for visual consistency. */
const PAGE_TOP_GAP = PAGE_GAP;

/** Horizontal padding around pages in fit-width mode (16px each side). */
const PAGE_PADDING_X = 32;

/**
 * Continuous-scroll PDF viewer with virtual rendering.
 *
 * Supports two zoom modes:
 * - "fit-width": pages fill the container width and re-scale on resize.
 * - "manual": pages are sized by a fixed zoom % (1% = 1pt per 100px). Pages
 *   are centered when narrower than the viewport; a horizontal scrollbar
 *   appears when wider. The view does not re-render on window resize.
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

    const zoom = useAppStore((s) => s.zoom);
    const zoomMode = useAppStore((s) => s.zoomMode);
    const setZoom = useAppStore((s) => s.setZoom);
    const setZoomMode = useAppStore((s) => s.setZoomMode);

    // Refs for use inside stable closures (virtualizer, event listeners).
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;
    const zoomModeRef = useRef(zoomMode);
    zoomModeRef.current = zoomMode;

    // "down" | "up" | null (null = initial load, no direction yet)
    const scrollDirectionRef = useRef<"down" | "up" | null>(null);

    // When scrollToPage() drives a programmatic scroll, the browser may clamp
    // scrollTop so that onScroll's position-based computation picks the wrong
    // page (e.g. the topmost visible page instead of the clicked one).
    // scrollToPage sets this to the intended index; onScroll consumes it once
    // and skips the position calculation entirely for that event.
    const pendingActiveRef = useRef<number | null>(null);

    function pageWidthFor(widthPts: number): number {
      if (zoomModeRef.current === "fit-width") {
        const containerWidth = parentRef.current?.clientWidth ?? 800;
        return Math.max(containerWidth - PAGE_PADDING_X, 100);
      }
      return Math.round((widthPts * zoomRef.current) / 100);
    }

    // Scale overscan inversely with zoom: at low zoom pages are cheap to
    // render so we pre-load more; at high zoom we minimise queued work.
    //   50 % → 3   100 % → 2   150 % → 1   200 %+ → 1
    const overscan = Math.min(4, Math.max(1, Math.ceil(150 / zoom)));

    const virtualizer = useVirtualizer({
      count: pageSizes.length,
      getScrollElement: () => parentRef.current,
      estimateSize: (i) => {
        const { width_pts, height_pts } = pageSizes[i];
        const pageWidth = pageWidthFor(width_pts);
        return Math.round((height_pts / width_pts) * pageWidth) + PAGE_GAP;
      },
      overscan,
      // Only pre-render in the direction of travel. When scrolling down we
      // pre-render one page below the visible area but not above, and vice
      // versa. On initial load (null direction) both sides get the buffer.
      rangeExtractor: (range) => {
        const dir = scrollDirectionRef.current;
        const above = dir === "down" ? 0 : range.overscan;
        const below = dir === "up"   ? 0 : range.overscan;
        const start = Math.max(0, range.startIndex - above);
        const end   = Math.min(range.count - 1, range.endIndex + below);
        const indices: number[] = [];
        for (let i = start; i <= end; i++) indices.push(i);
        return indices;
      },
    });

    // estimateSize uses parentRef.current?.clientWidth which is null on the
    // first render. Calling measure() after mount resets the cache so heights
    // are recalculated with the real container width.
    useEffect(() => {
      virtualizer.measure();
      // Sync effective zoom to store for status bar display when in fit-width mode.
      const el = parentRef.current;
      if (el && zoomModeRef.current === "fit-width" && pageSizes.length > 0) {
        setZoom(
          Math.round(
            ((el.clientWidth - PAGE_PADDING_X) / pageSizes[0].width_pts) * 100
          )
        );
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-measure when zoom or mode changes so heights update immediately.
    useEffect(() => {
      virtualizer.measure();
    }, [zoom, zoomMode, virtualizer]);

    // In fit-width mode: reset height estimates on container width change and
    // sync the effective zoom % to the store so the status bar stays accurate.
    // The ResizeObserver is throttled to one update per animation frame so that
    // rapid window-drag events don't flood React with redundant re-renders.
    // virtualizer.measure() is intentionally omitted here — the [zoom, zoomMode]
    // effect below fires immediately after setZoom and calls it exactly once.
    useEffect(() => {
      const el = parentRef.current;
      if (!el) return;
      let lastWidth = el.clientWidth;
      let rafPending = false;
      const ro = new ResizeObserver(() => {
        if (el.clientWidth === lastWidth) return;
        lastWidth = el.clientWidth;
        if (rafPending || zoomModeRef.current !== "fit-width") return;
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          if (pageSizes.length > 0) {
            setZoom(
              Math.round(
                ((el.clientWidth - PAGE_PADDING_X) /
                  pageSizes[0].width_pts) *
                  100
              )
            );
          }
        });
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, [pageSizes, setZoom]);

    // Ctrl+scroll / trackpad pinch: zoom continuously, switch to manual mode.
    useEffect(() => {
      const el = parentRef.current;
      if (!el) return;
      function onWheel(e: WheelEvent) {
        if (!e.ctrlKey) return;
        e.preventDefault();
        const factor = 1 - e.deltaY * 0.005;
        const next = Math.round(
          Math.max(25, Math.min(400, zoomRef.current * factor))
        );
        setZoom(next);
        setZoomMode("manual");
      }
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }, [setZoom, setZoomMode]);

    // Expose scrollToPage to the parent (App) so the sidebar can drive it.
    // We compute the offset directly rather than using virtualizer.scrollToIndex
    // because scrollToIndex triggers a reconcile loop (scheduleScrollReconcile)
    // that spins on requestAnimationFrame waiting for the scroll event to update
    // the virtualizer's cached scrollOffset. In WKWebView the scroll event fires
    // asynchronously, so the loop runs for up to MAX_RECONCILE_MS (5 s) before
    // stabilising — causing the 2-3 s freeze observed at 200%+ zoom.
    // Setting el.scrollTop directly bypasses the loop entirely; the virtualizer's
    // existing scroll listener picks up the change on the next frame as normal.
    useImperativeHandle(ref, () => ({
      scrollToPage(index) {
        const el = parentRef.current;
        if (!el) return;
        let offset = PAGE_TOP_GAP;
        for (let i = 0; i < index; i++) {
          const { width_pts, height_pts } = pageSizes[i];
          offset += Math.round((height_pts / width_pts) * pageWidthFor(width_pts)) + PAGE_GAP;
        }
        // Set direction before changing scrollTop so the rangeExtractor sees
        // the correct direction when the virtualizer re-renders on scroll.
        scrollDirectionRef.current = offset > el.scrollTop ? "down" : "up";
        // Tell onScroll to use this index directly rather than re-deriving the
        // active page from the scroll position. This handles two cases:
        //   1. scrollTop is clamped (offset > maxScrollTop) so position maths
        //      would pick the wrong page.
        //   2. The page is already visible and scrollTop doesn't change, so no
        //      scroll event fires at all — the direct setActivePage below
        //      handles highlighting immediately in that case.
        pendingActiveRef.current = index;
        el.scrollTop = offset;
        // Optimistic direct set for the no-scroll-event case (page already visible).
        useAppStore.getState().setActivePage(index);
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
      let lastActive = 0;
      let lastScrollTop = 0;

      function onScroll() {
        const scrollTop = el!.scrollTop;
        scrollDirectionRef.current = scrollTop > lastScrollTop ? "down" : "up";
        lastScrollTop = scrollTop;

        let active: number;
        if (pendingActiveRef.current !== null) {
          // This scroll was triggered by scrollToPage(). Use the intended page
          // directly — position maths would pick the wrong page when scrollTop
          // is clamped (offset > maxScrollTop) or when multiple pages are
          // visible simultaneously at low zoom.
          active = pendingActiveRef.current;
          pendingActiveRef.current = null;
        } else {
          // Natural scroll: find the topmost page whose top edge has passed
          // 50px below the scroll position (grace zone so flipping isn't eager).
          let y = PAGE_GAP;
          active = 0;
          for (let i = 0; i < pageSizes.length; i++) {
            const { width_pts, height_pts } = pageSizes[i];
            // Each page may have a different width in manual mode.
            const pw =
              zoomModeRef.current === "fit-width"
                ? Math.max(el!.clientWidth - PAGE_PADDING_X, 100)
                : Math.round((width_pts * zoomRef.current) / 100);
            const h = Math.round((height_pts / width_pts) * pw) + PAGE_GAP;
            if (y > scrollTop + 50) break;
            active = i;
            y += h;
          }
        }

        // Only update the store when the active page actually changes — avoids
        // redundant zustand updates (and React re-renders) while scrolling
        // within a single page.
        if (active !== lastActive) {
          lastActive = active;
          setActivePage(active);
        }
      }

      el.addEventListener("scroll", onScroll, { passive: true });
      return () => el.removeEventListener("scroll", onScroll);
    }, [pageSizes, setActivePage]);

    // In manual mode: set a minWidth on the scroll container so the horizontal
    // scrollbar appears when pages are wider than the viewport.
    const manualContentWidth =
      zoomMode === "manual" && pageSizes.length > 0
        ? Math.round((pageSizes[0].width_pts * zoom) / 100) + PAGE_PADDING_X
        : undefined;

    return (
      <div
        ref={parentRef}
        className={cn(
          "h-full bg-muted",
          zoomMode === "fit-width" ? "overflow-y-auto" : "overflow-auto"
        )}
      >
        {/* Spacer that gives the scrollbar the correct total height. */}
        <div
          className="relative w-full"
          style={{
            height: virtualizer.getTotalSize() + PAGE_TOP_GAP,
            minWidth: manualContentWidth,
          }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const { width_pts, height_pts } = pageSizes[item.index];
            const pageWidth =
              zoomMode === "fit-width"
                ? Math.max(
                    (parentRef.current?.clientWidth ?? 800) - PAGE_PADDING_X,
                    100
                  )
                : Math.round((width_pts * zoom) / 100);

            return (
              <div
                key={item.key}
                className="absolute left-0 right-0"
                style={{ top: item.start + PAGE_TOP_GAP, paddingBottom: PAGE_GAP }}
              >
                {/* mx-auto centers the page when it's narrower than the viewport. */}
                <div style={{ width: pageWidth, margin: "0 auto" }}>
                  <PageImage
                    docId={docId}
                    pageIndex={item.index}
                    width={pageWidth}
                    widthPts={width_pts}
                    heightPts={height_pts}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);
