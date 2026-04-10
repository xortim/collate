import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { BugIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";

interface Props {
  docId: number;
  pageIndex: number;
  /** Available content width in CSS pixels — from ResizeObserver in PageSidebar. */
  width: number;
  widthPts: number;
  heightPts: number;
  isActive: boolean;
  isSelected: boolean;
  onClick(e: React.MouseEvent): void;
  onBugReport(message: string): void;
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
 * Highlights with accent ring when selected, active ring when topmost visible.
 *
 * On sidebar resize, the old thumbnail stays visible (CSS-scaled) while the
 * debounced re-render loads, eliminating skeleton flash during dragging.
 *
 * Right-clicking opens a context menu. Rotate and Delete are wired to stub
 * Tauri commands (they toast on error until mutations are implemented).
 * Insert Before / Insert After remain disabled until implemented.
 */
export function SidebarThumbnail({
  docId,
  pageIndex,
  width,
  widthPts,
  heightPts,
  isActive,
  isSelected,
  onClick,
  onBugReport,
}: Props) {
  const selectedPages = useAppStore((s) => s.selectedPages);

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

  async function invokeOnPages(command: string, extraArgs: Record<string, unknown> = {}) {
    const indices = selectedPages.has(pageIndex)
      ? [...selectedPages].sort((a, b) => a - b)
      : [pageIndex];
    try {
      await invoke(command, { docId, pageIndices: indices, ...extraArgs });
    } catch (e) {
      const message = String(e);
      toast.error(message, {
        id: "pdf-error",
        duration: 6000,
        action: {
          label: <BugIcon className="size-4" />,
          onClick: () => onBugReport(message),
        },
      });
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "w-full flex flex-col items-center gap-1 p-2 rounded-md cursor-pointer hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isSelected
              ? "ring-4 ring-blue-500"
              : isActive
                ? "ring-2 ring-primary"
                : ""
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
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => invokeOnPages("rotate_pages", { degrees: 90 })}>
          Rotate Clockwise
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => invokeOnPages("rotate_pages", { degrees: -90 })}>
          Rotate Counter-Clockwise
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => invokeOnPages("delete_pages")}>
          Delete Page
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled>Insert Page Before</ContextMenuItem>
        <ContextMenuItem disabled>Insert Page After</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
