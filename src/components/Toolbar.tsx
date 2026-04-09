import {
  FolderOpen,
  Maximize2,
  Monitor,
  Moon,
  Printer,
  Redo2,
  Save,
  Search,
  Sun,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppStore, type Theme, ZOOM_STEPS } from "@/store";
import { modKey, shiftModKey } from "@/lib/platform";

interface ToolbarProps {
  onOpen(): void;
  loading: boolean;
  hasDocument: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSave(): void;
  onUndo(): void;
  onRedo(): void;
}

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

export function Toolbar({ onOpen, loading, hasDocument, canUndo, canRedo, onSave, onUndo, onRedo }: ToolbarProps) {
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

  return (
    <TooltipProvider delayDuration={600}>
      <header className="flex items-center gap-2 px-2 h-11 shrink-0">
        <SidebarTrigger />

        <ButtonGroup>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={onOpen} disabled={loading} className="gap-1.5">
                <FolderOpen className="size-4" />
                {loading ? "Opening…" : "Open"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open PDF ({modKey()}O)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="outline" onClick={onSave} disabled={!hasDocument} aria-label="Save">
                <Save className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save ({modKey()}S)</TooltipContent>
          </Tooltip>
        </ButtonGroup>

        <ButtonGroup>
          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="outline" onClick={onUndo} disabled={!canUndo} aria-label="Undo">
                  <Undo2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo ({modKey()}Z)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="outline" onClick={onRedo} disabled={!canRedo} aria-label="Redo">
                  <Redo2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo ({shiftModKey()}Z)</TooltipContent>
            </Tooltip>
          </ButtonGroup>

          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={zoomOut}
                  disabled={!hasDocument || (zoom <= ZOOM_STEPS[0] && zoomMode === "manual")}
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
                  variant="outline"
                  onClick={zoomIn}
                  disabled={!hasDocument || (zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1] && zoomMode === "manual")}
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
                  variant={zoomMode === "fit-width" ? "secondary" : "outline"}
                  onClick={fitWidth}
                  disabled={!hasDocument}
                  aria-label="Fit width"
                >
                  <Maximize2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fit Width ({modKey()}0)</TooltipContent>
            </Tooltip>
          </ButtonGroup>

          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="outline" disabled aria-label="Find">
                  <Search className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Find ({modKey()}F) — coming soon</TooltipContent>
            </Tooltip>
          </ButtonGroup>

          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="outline" disabled aria-label="Print">
                  <Printer className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Print ({modKey()}P) — coming in P1.6</TooltipContent>
            </Tooltip>
          </ButtonGroup>
        </ButtonGroup>

        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
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
