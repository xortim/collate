import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { PageImage } from "./PageImage";

interface PageSize {
  width_pts: number;
  height_pts: number;
}

interface Props {
  docId: number;
  pageSizes: PageSize[];
}

/** Gap between pages in pixels. */
const PAGE_GAP = 16;

/**
 * Continuous-scroll PDF viewer with virtual rendering.
 *
 * Only the pages visible in the viewport (plus a small overscan buffer) are
 * mounted. Pages that scroll out of view unmount, freeing their image data.
 * Row heights are estimated from PDF point dimensions before the image loads,
 * so the scroll bar is accurate from the start.
 */
export function PageViewer({ docId, pageSizes }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: pageSizes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => {
      const containerWidth = parentRef.current?.clientWidth ?? 800;
      const { width_pts, height_pts } = pageSizes[i];
      return Math.round((height_pts / width_pts) * containerWidth) + PAGE_GAP;
    },
    // Render 2 pages beyond the visible area so the next page is ready
    // before the user scrolls to it.
    overscan: 2,
  });

  return (
    <div
      ref={parentRef}
      className="overflow-y-auto h-full bg-gray-200"
    >
      {/* Spacer that gives the scrollbar the correct total height. */}
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const { width_pts, height_pts } = pageSizes[item.index];
          const containerWidth = parentRef.current?.clientWidth ?? 800;

          return (
            <div
              key={item.key}
              className="absolute left-0 right-0 flex justify-center"
              style={{ top: item.start, paddingBottom: PAGE_GAP }}
            >
              <div className="w-full max-w-4xl px-4">
                <PageImage
                  docId={docId}
                  pageIndex={item.index}
                  width={containerWidth}
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
