import { useAppStore } from "@/store";

interface StatusBarProps {
  pageCount: number | undefined;
}

export function StatusBar({ pageCount }: StatusBarProps) {
  const activePage = useAppStore((s) => s.activePage);
  const zoom = useAppStore((s) => s.zoom);
  const zoomMode = useAppStore((s) => s.zoomMode);

  if (pageCount == null) return null;

  return (
    <footer className="flex items-center justify-between px-3 h-6 shrink-0 text-xs text-muted-foreground border-t bg-muted/40 select-none">
      <span>
        Page {activePage + 1} of {pageCount}
      </span>
      <span>
        {zoomMode === "fit-width" ? "Fit" : `${zoom}%`}
      </span>
    </footer>
  );
}
