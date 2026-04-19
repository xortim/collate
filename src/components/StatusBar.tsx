import { AlertTriangle } from "lucide-react";
import { useAppStore } from "@/store";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StatusBarProps {
  pageCount: number | undefined;
}

export function StatusBar({ pageCount }: StatusBarProps) {
  const activePage = useAppStore((s) => s.activePage);
  const zoom = useAppStore((s) => s.zoom);
  const zoomMode = useAppStore((s) => s.zoomMode);
  const isDirty = useAppStore((s) => s.isDirty);
  const activePageScanned = useAppStore((s) => s.activePageScanned);

  if (pageCount == null) {
    return <footer className="h-6 shrink-0 border-t bg-muted/40" />;
  }

  return (
    <footer className="flex items-center justify-between px-3 h-6 shrink-0 text-xs text-muted-foreground border-t bg-muted/40 select-none">
      <span>
        {isDirty && <span className="mr-1">•</span>}
        Page {activePage + 1} of {pageCount}
      </span>
      <span className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Invisible placeholder keeps layout stable when not scanned */}
              <span
                className="text-amber-500"
                style={{ visibility: activePageScanned ? "visible" : "hidden" }}
                aria-label="Scanned page"
              >
                <AlertTriangle className="h-3 w-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              This page is a scanned image — text selection is unavailable. OCR
              support is coming in a future update.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {zoomMode === "fit-width" ? "Fit" : `${zoom}%`}
      </span>
    </footer>
  );
}
