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

  function cycleTheme() {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];
    setTheme(next);
  }

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
            <Button size="icon" variant="ghost" className="size-8" disabled aria-label="Zoom out">
              <ZoomOut className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom Out — coming in P1.4</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" disabled aria-label="Zoom in">
              <ZoomIn className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom In — coming in P1.4</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" disabled aria-label="Fit page">
              <Maximize2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fit Page — coming in P1.4</TooltipContent>
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
