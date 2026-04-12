import { useEffect, useRef, useState } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { BugIcon } from "lucide-react";
import { BugReportDialog } from "./components/BugReportDialog";
import { InfoPanel } from "./components/InfoPanel";
import { ShortcutOverlay } from "./components/ShortcutOverlay";
import { EmptyState } from "./components/EmptyState";
import { PageViewer, PageViewerHandle } from "./components/PageViewer";
import { PageSidebar } from "./components/PageSidebar";
import { Toolbar } from "./components/Toolbar";
import { StatusBar } from "./components/StatusBar";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useAppStore, ZOOM_STEPS, PageDisplay } from "@/store";
import { useTheme } from "@/hooks/useTheme";
import { platformName } from "@/lib/platform";

interface PageSize {
  width_pts: number;
  height_pts: number;
}

interface DocumentManifest {
  doc_id: number;
  page_count: number;
  filename: string;
  path: string;
  page_sizes: PageSize[];
  can_undo: boolean;
  can_redo: boolean;
}

function App() {
  const [manifest, setManifest] = useState<DocumentManifest | null>(null);
  const [loading, setLoading] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [bugPrefill, setBugPrefill] = useState<{ title: string; description: string } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const viewerRef = useRef<PageViewerHandle>(null);
  const manifestRef = useRef<DocumentManifest | null>(null);
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const isDirty = useAppStore((s) => s.isDirty);
  const infoPanelOpen = useAppStore((s) => s.infoPanelOpen);
  const setInfoPanelOpen = useAppStore((s) => s.setInfoPanelOpen);
  const toggleInfoPanel = useAppStore((s) => s.toggleInfoPanel);
  const recentFiles = useAppStore((s) => s.recentFiles);

  // Apply theme (dark class on <html>) and keep it in sync with OS changes
  useTheme();

  // Sync the "Open Recent" submenu once on mount with whatever was persisted.
  useEffect(() => {
    void invoke("update_recent_menu", { paths: recentFiles });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    useAppStore.getState().clearSelection();
    useAppStore.getState().setIsDirty(false);
    useAppStore.getState().setInfoPanelOpen(false);
  }

  function showError(message: string) {
    toast.error(message, {
      duration: 6000,
      action: {
        label: <BugIcon className="size-4" />,
        onClick: () => openBugReportForError(message),
      },
    });
  }

  async function handleSave(path?: string) {
    const m = manifestRef.current;
    if (!m) return;
    const savePath = path ?? m.path;
    try {
      await invoke("save_document", { docId: m.doc_id, path: savePath });
      useAppStore.getState().setIsDirty(false);
    } catch (e) {
      showError(String(e));
    }
  }

  async function handleSaveAs() {
    const path = await saveDialog({ filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (path) await handleSave(path);
  }

  async function handleUndo() {
    const m = manifestRef.current;
    if (!m) return;
    try {
      const next = await invoke<DocumentManifest>("undo_document", { docId: m.doc_id });
      setManifest(next);
    } catch (e) {
      showError(String(e));
    }
  }

  async function handleRedo() {
    const m = manifestRef.current;
    if (!m) return;
    try {
      const next = await invoke<DocumentManifest>("redo_document", { docId: m.doc_id });
      setManifest(next);
    } catch (e) {
      showError(String(e));
    }
  }

  async function openBugReportForError(message: string) {
    const version = await getVersion().catch(() => "unknown");
    setBugPrefill({
      title: `Error: ${message.slice(0, 50)}`,
      description:
        `Error: ${message}\n\nVersion: ${version}\nPlatform: ${platformName}` +
        `\n\n---\nPlease describe what you were doing when this happened:\n`,
    });
    setBugReportOpen(true);
  }

  async function handleOpenPath(path: string) {
    setLoading(true);
    const current = manifestRef.current;
    if (current) {
      await invoke("close_document", { docId: current.doc_id });
    }
    setManifest(null);
    try {
      const m = await invoke<DocumentManifest>("open_document", { path });
      setManifest(m);
      useAppStore.getState().setActivePage(0);
      useAppStore.getState().clearSelection();
      useAppStore.getState().setIsDirty(false);
      void invoke("set_pdf_menus_enabled", { enabled: true });
      useAppStore.getState().addRecentFile(path);
      void invoke("update_recent_menu", { paths: useAppStore.getState().recentFiles });
    } catch (e) {
      showError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleOpen() {
    const path = await openDialog({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!path) return;
    await handleOpenPath(path);
  }

  // Handle Mod+= for zoom in (mirrors the native menu's CmdOrCtrl+= shortcut).
  // Also handles ? (shortcut overlay) and Cmd+A (select all pages).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "=") {
        e.preventDefault();
        const { zoom, setZoom, setZoomMode } = useAppStore.getState();
        const next = ZOOM_STEPS.find((s) => s > zoom) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
        setZoom(next);
        setZoomMode("manual");
      }
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        const m = manifestRef.current;
        if (m) {
          e.preventDefault();
          useAppStore.getState().selectAll(m.page_count);
        }
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
    const unlistenDocInfo   = listen<void>("menu-doc-info",   () => useAppStore.getState().toggleInfoPanel());
    const unlistenReportBug = listen<void>("menu-report-bug", () => {
      setBugReportOpen(true);
    });
    const unlistenSave    = listen<void>("menu-save",    () => handleSave());
    const unlistenSaveAs  = listen<void>("menu-save-as", () => handleSaveAs());
    const unlistenUndo      = listen<void>("menu-undo",       () => handleUndo());
    const unlistenRedo      = listen<void>("menu-redo",       () => handleRedo());
    const unlistenSelectAll = listen<void>("menu-select-all", () => {
      const m = manifestRef.current;
      if (m) useAppStore.getState().selectAll(m.page_count);
    });
    const unlistenPrint   = listen<void>("menu-print",   () => {
      toast.error("Print is not yet implemented.", { duration: 4000 });
    });
    const unlistenOpenRecent = listen<string>("menu-open-recent", (e) => {
      void handleOpenPath(e.payload);
    });
    const unlistenClearRecent = listen<void>("menu-clear-recent", () => {
      useAppStore.getState().clearRecentFiles();
      void invoke("update_recent_menu", { paths: [] });
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
      unlistenDocInfo.then((fn) => fn());
      unlistenReportBug.then((fn) => fn());
      unlistenSave.then((fn) => fn());
      unlistenSaveAs.then((fn) => fn());
      unlistenUndo.then((fn) => fn());
      unlistenRedo.then((fn) => fn());
      unlistenSelectAll.then((fn) => fn());
      unlistenPrint.then((fn) => fn());
      unlistenOpenRecent.then((fn) => fn());
      unlistenClearRecent.then((fn) => fn());
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
            onBugReport={openBugReportForError}
          />
        </Sidebar>
      )}

      <SidebarInset className="flex flex-col overflow-hidden">
        <Toolbar
          onOpen={handleOpen}
          loading={loading}
          hasDocument={manifest !== null}
          isDirty={isDirty}
          canUndo={manifest?.can_undo ?? false}
          canRedo={manifest?.can_redo ?? false}
          onSave={handleSave}
          onUndo={handleUndo}
          onRedo={handleRedo}
          infoPanelOpen={infoPanelOpen}
          onToggleInfo={toggleInfoPanel}
        />

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

      {manifest && (
        <InfoPanel
          docId={manifest.doc_id}
          filename={manifest.filename}
          open={infoPanelOpen}
          onOpenChange={setInfoPanelOpen}
        />
      )}

      <ShortcutOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />

      <BugReportDialog
        open={bugReportOpen}
        onOpenChange={(next) => {
          setBugReportOpen(next);
          if (!next) setBugPrefill(null);
        }}
        prefill={bugPrefill ?? undefined}
      />
      <Toaster theme={theme} position="top-center" offset={{ top: 56 }} />
    </SidebarProvider>
  );
}

export default App;
