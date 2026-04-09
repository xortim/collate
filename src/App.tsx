import { useEffect, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { BugIcon } from "lucide-react";
import { BugReportDialog } from "./components/BugReportDialog";
import { EmptyState } from "./components/EmptyState";
import { PageViewer, PageViewerHandle } from "./components/PageViewer";
import { PageSidebar } from "./components/PageSidebar";
import { Toolbar } from "./components/Toolbar";
import { StatusBar } from "./components/StatusBar";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useAppStore, ZOOM_STEPS, PageDisplay } from "@/store";
import { useTheme } from "@/hooks/useTheme";

interface PageSize {
  width_pts: number;
  height_pts: number;
}

interface DocumentManifest {
  doc_id: number;
  page_count: number;
  filename: string;
  page_sizes: PageSize[];
}

function App() {
  const [manifest, setManifest] = useState<DocumentManifest | null>(null);
  const [loading, setLoading] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [bugPrefill, setBugPrefill] = useState<{ title: string; description: string } | null>(null);

  const viewerRef = useRef<PageViewerHandle>(null);
  const manifestRef = useRef<DocumentManifest | null>(null);
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  // Apply theme (dark class on <html>) and keep it in sync with OS changes
  useTheme();

  // Sync native menu checkmarks whenever theme changes.
  // Fires on startup (picks up persisted value) and after toolbar cycle changes.
  useEffect(() => {
    invoke("set_menu_theme", { theme });
  }, [theme]);

  // Keep ref in sync so menu event listeners (registered once on mount) always
  // see the current manifest rather than the stale closure value.
  useEffect(() => { manifestRef.current = manifest; }, [manifest]);

  async function handleClose() {
    const m = manifestRef.current;
    if (!m) return;
    await invoke("close_document", { docId: m.doc_id });
    await invoke("set_pdf_menus_enabled", { enabled: false });
    setManifest(null);
    useAppStore.getState().setActivePage(0);
  }

  async function openBugReportForError(message: string) {
    const version = await getVersion().catch(() => "unknown");
    const platform = /mac/i.test(navigator.platform)
      ? "macOS"
      : /win/i.test(navigator.platform)
        ? "Windows"
        : "Linux";
    setBugPrefill({
      title: `Error: ${message.slice(0, 50)}`,
      description:
        `Error: ${message}\n\nVersion: ${version}\nPlatform: ${platform}` +
        `\n\n---\nPlease describe what you were doing when this happened:\n`,
    });
    setBugReportOpen(true);
  }

  async function handleOpen() {
    const path = await openDialog({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });

    if (!path) return;

    setLoading(true);

    if (manifest) {
      await invoke("close_document", { docId: manifest.doc_id });
    }
    setManifest(null);

    try {
      const m = await invoke<DocumentManifest>("open_document", { path });
      setManifest(m);
      useAppStore.getState().setActivePage(0);
      void invoke("set_pdf_menus_enabled", { enabled: true });
    } catch (e) {
      const message = String(e);
      toast.error(message, {
        id: "pdf-error",
        duration: Infinity,
        closeButton: true,
        action: {
          label: (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span><BugIcon className="size-4" /></span>
                </TooltipTrigger>
                <TooltipContent>Report a bug</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ),
          onClick: () => openBugReportForError(message),
        },
      });
    } finally {
      setLoading(false);
    }
  }

  // Alias Mod+= to Mod++ for zoom in. The native menu owns Mod++ (CmdOrCtrl+Plus);
  // Mod+= is the unshifted physical key and is not consumed by the menu.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "=") {
        e.preventDefault();
        const { zoom, setZoom, setZoomMode } = useAppStore.getState();
        const next = ZOOM_STEPS.find((s) => s > zoom) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
        setZoom(next);
        setZoomMode("manual");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Listen for native menu events forwarded from the Rust backend
  useEffect(() => {
    const unlistenOpen  = listen<void>("menu-open",  () => handleOpen());
    const unlistenClose = listen<void>("menu-close", () => handleClose());
    const unlistenTheme = listen<string>("menu-theme", (e) =>
      setTheme(e.payload as "light" | "dark" | "system")
    );
    const unlistenZoomIn = listen<void>("menu-zoom-in", () => {
      const { zoom, setZoom, setZoomMode } = useAppStore.getState();
      const next = ZOOM_STEPS.find((s) => s > zoom) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
      setZoom(next);
      setZoomMode("manual");
    });
    const unlistenZoomOut = listen<void>("menu-zoom-out", () => {
      const { zoom, setZoom, setZoomMode } = useAppStore.getState();
      const prev = [...ZOOM_STEPS].reverse().find((s) => s < zoom) ?? ZOOM_STEPS[0];
      setZoom(prev);
      setZoomMode("manual");
    });
    const unlistenZoomFit = listen<void>("menu-zoom-fit-width", () => {
      useAppStore.getState().setZoomMode("fit-width");
    });
    // Document menu stubs — not yet implemented, no-op for now
    const unlistenRotateCw     = listen<void>("menu-rotate-cw",      () => { /* stub */ });
    const unlistenRotateCwAll  = listen<void>("menu-rotate-cw-all",  () => { /* stub */ });
    const unlistenRotateCcw    = listen<void>("menu-rotate-ccw",     () => { /* stub */ });
    const unlistenRotateCcwAll = listen<void>("menu-rotate-ccw-all", () => { /* stub */ });
    const unlistenSplit        = listen<void>("menu-split",          () => { /* stub */ });
    const unlistenMerge        = listen<void>("menu-merge",          () => { /* stub */ });
    const unlistenImport       = listen<void>("menu-import-pages",   () => { /* stub */ });
    // View → Page Display
    const unlistenDisplay = listen<string>("menu-display", (e) => {
      useAppStore.getState().setPageDisplay(e.payload as PageDisplay);
    });
    const unlistenReportBug = listen<void>("menu-report-bug", () => {
      setBugReportOpen(true);
    });
    return () => {
      unlistenOpen.then((fn) => fn());
      unlistenClose.then((fn) => fn());
      unlistenTheme.then((fn) => fn());
      unlistenZoomIn.then((fn) => fn());
      unlistenZoomOut.then((fn) => fn());
      unlistenZoomFit.then((fn) => fn());
      unlistenRotateCw.then((fn) => fn());
      unlistenRotateCwAll.then((fn) => fn());
      unlistenRotateCcw.then((fn) => fn());
      unlistenRotateCcwAll.then((fn) => fn());
      unlistenSplit.then((fn) => fn());
      unlistenMerge.then((fn) => fn());
      unlistenImport.then((fn) => fn());
      unlistenDisplay.then((fn) => fn());
      unlistenReportBug.then((fn) => fn());
    };
    // handleOpen is defined in render scope but only reads stable refs/setState.
    // Omitting from deps avoids re-registering listeners on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // SidebarProvider manages open/closed state, Cmd+B shortcut, and cookie
    // persistence. --sidebar-width overrides the default 16rem to a narrower
    // strip appropriate for page thumbnails.
    <SidebarProvider
      defaultOpen={true}
      className="h-screen overflow-hidden"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      {manifest && (
        <Sidebar collapsible="offcanvas">
          <PageSidebar
            docId={manifest.doc_id}
            pageSizes={manifest.page_sizes}
            onScrollToPage={(i) => viewerRef.current?.scrollToPage(i)}
          />
        </Sidebar>
      )}

      <SidebarInset className="flex flex-col overflow-hidden">
        <Toolbar onOpen={handleOpen} loading={loading} hasDocument={manifest !== null} />

        <Separator />

        <div className="flex-1 overflow-hidden min-h-0">
          {manifest ? (
            <PageViewer
              ref={viewerRef}
              docId={manifest.doc_id}
              pageSizes={manifest.page_sizes}
            />
          ) : (
            <EmptyState onOpen={handleOpen} />
          )}
        </div>

        <StatusBar pageCount={manifest?.page_count} />
      </SidebarInset>

      <BugReportDialog
        open={bugReportOpen}
        onOpenChange={(next) => {
          setBugReportOpen(next);
          if (!next) setBugPrefill(null);
        }}
        prefill={bugPrefill ?? undefined}
      />
      <Toaster theme={theme} richColors position="bottom-right" closeButton />
    </SidebarProvider>
  );
}

export default App;
