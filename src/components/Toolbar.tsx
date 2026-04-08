import { useEffect } from "react";
import {
  FolderOpen,
  Maximize2,
  Monitor,
  Moon,
  Printer,
  Redo2,
  Search,
  Sun,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppStore, type Theme } from "@/store";
import { modKey, shiftModKey } from "@/lib/platform";

interface ToolbarProps {
  onOpen(): void;
  loading: boolean;
}

const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400];

const THEME_CYCLE: Theme[] = ["system", "light", "dark"];

const THEME_ICON: Record<Theme, React.ReactNode> = {
  system: <Monitor className="size-4" />,
  light: <Sun className="size-4" />,
  dark: <Moon className="size-4" />,
};

const THEME_LABEL: Record<Theme, string> = {
  system: "Theme: System",
  light: "Theme: Light",
  dark: "Theme: Dark",
};

export function Toolbar({ onOpen, loading }: ToolbarProps) {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const zoom = useAppStore((s) => s.zoom);
  const zoomMode = useAppStore((s) => s.zoomMode);
  const setZoom = useAppStore((s) => s.setZoom);
  const setZoomMode = useAppStore((s) => s.setZoomMode);

  function cycleTheme() {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];
    setTheme(next);
  }

  function zoomIn() {
    const next = ZOOM_STEPS.find((s) => s > zoom) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
    setZoom(next);
    setZoomMode("manual");
  }

  function zoomOut() {
    const prev = [...ZOOM_STEPS].reverse().find((s) => s < zoom) ?? ZOOM_STEPS[0];
    setZoom(prev);
    setZoomMode("manual");
  }

  function fitWidth() {
    setZoomMode("fit-width");
  }

  // Keyboard shortcuts: ⌘+/⌘= zoom in, ⌘- zoom out, ⌘0 fit width.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        fitWidth();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // Re-register when zoom changes so zoomIn/zoomOut close over the current value.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  return (
    <TooltipProvider delayDuration={600}>
      <header className="flex items-center gap-1 px-2 h-11 shrink-0">
        <SidebarTrigger />
        <div aria-hidden className="w-px h-5 bg-border mx-1 shrink-0" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" onClick={onOpen} disabled={loading} className="gap-1.5">
              <FolderOpen className="size-4" />
              {loading ? "Opening…" : "Open"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open PDF ({modKey()}O)</TooltipContent>
        </Tooltip>

        <div aria-hidden className="w-px h-5 bg-border mx-1 shrink-0" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" disabled aria-label="Undo">
              <Undo2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Undo ({modKey()}Z) — coming soon</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" disabled aria-label="Redo">
              <Redo2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Redo ({shiftModKey()}Z) — coming soon</TooltipContent>
        </Tooltip>

        <div aria-hidden className="w-px h-5 bg-border mx-1 shrink-0" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={zoomOut}
              disabled={zoom <= ZOOM_STEPS[0] && zoomMode === "manual"}
              aria-label="Zoom out"
            >
              <ZoomOut className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom Out ({modKey()}−)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={zoomIn}
              disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1] && zoomMode === "manual"}
              aria-label="Zoom in"
            >
              <ZoomIn className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom In ({modKey()}+)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant={zoomMode === "fit-width" ? "secondary" : "ghost"}
              className="size-8"
              onClick={fitWidth}
              aria-label="Fit width"
            >
              <Maximize2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fit Width ({modKey()}0)</TooltipContent>
        </Tooltip>

        <div aria-hidden className="w-px h-5 bg-border mx-1 shrink-0" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" disabled aria-label="Find">
              <Search className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Find ({modKey()}F) — coming soon</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" disabled aria-label="Print">
              <Printer className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Print ({modKey()}P) — coming in P1.6</TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={cycleTheme}
              aria-label={THEME_LABEL[theme]}
            >
              {THEME_ICON[theme]}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{THEME_LABEL[theme]}</TooltipContent>
        </Tooltip>
      </header>
    </TooltipProvider>
  );
}
