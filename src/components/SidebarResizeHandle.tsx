import { useRef } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { useAppStore } from "@/store";

const MIN_WIDTH = 120;
const MAX_WIDTH = 320;
// Drag below this threshold to auto-close the sidebar. The pre-drag width is
// preserved in the store so reopening (Cmd+B or toggle) restores it.
const SNAP_CLOSE_THRESHOLD = 80;

export function SidebarResizeHandle() {
  const { state, setOpen } = useSidebar();
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  if (state !== "expanded") return null;

  return (
    <div
      aria-hidden
      className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-border active:bg-border z-20"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.dataset.sidebarDragging = "";
        drag.current = {
          startX: e.clientX,
          startWidth: useAppStore.getState().sidebarWidth,
        };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const raw = drag.current.startWidth + e.clientX - drag.current.startX;
        if (raw < SNAP_CLOSE_THRESHOLD) {
          // Restore the pre-drag width before closing so reopening snaps back.
          setSidebarWidth(drag.current.startWidth);
          drag.current = null;
          delete document.body.dataset.sidebarDragging;
          setOpen(false);
          return;
        }
        setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, raw)));
      }}
      onPointerUp={() => {
        drag.current = null;
        delete document.body.dataset.sidebarDragging;
      }}
    />
  );
}
