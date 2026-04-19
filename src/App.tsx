import { useEffect, useRef, useState } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { toast } from "sonner";
import { BugIcon } from "lucide-react";
import { BugReportDialog } from "./components/BugReportDialog";
import { InfoPanel } from "./components/InfoPanel";
import { ShortcutOverlay } from "./components/ShortcutOverlay";
import { EmptyState } from "./components/EmptyState";
import { PageViewer, PageViewerHandle } from "./components/PageViewer";
import { PageSidebar } from "./components/PageSidebar";
import { TabBar } from "./components/TabBar";
import { Toolbar } from "./components/Toolbar";
import { StatusBar } from "./components/StatusBar";
import { Toaster } from "@/components/ui/sonner";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useAppStore, ZOOM_STEPS, PageDisplay, TabEntry } from "@/store";
import { useTheme } from "@/hooks/useTheme";
import { useKeyboardNav, isInputFocused } from "@/hooks/useKeyboardNav";
import { platformName } from "@/lib/platform";
import { cn } from "@/lib/utils";
import type { DocumentManifest } from "@/types";

function App() {
  const [loading, setLoading] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [bugPrefill, setBugPrefill] = useState<{ title: string; description: string } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const viewerRef = useRef<PageViewerHandle>(null);
  // Stable ref for use inside event listener closures
  const activeTabRef = useRef<TabEntry | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const tabs = useAppStore((s) => s.tabs);
  const activeDocId = useAppStore((s) => s.activeDocId);
  const activeTab = tabs.find((t) => t.docId === activeDocId) ?? null;
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const isDirty = useAppStore((s) => s.isDirty);
  const infoPanelOpen = useAppStore((s) => s.infoPanelOpen);
  const setInfoPanelOpen = useAppStore((s) => s.setInfoPanelOpen);
  const toggleInfoPanel = useAppStore((s) => s.toggleInfoPanel);
  const reorderTabs = useAppStore((s) => s.reorderTabs);

  // Apply theme (dark class on <html>) and keep it in sync with OS changes
  useTheme();
  useKeyboardNav({ pageViewerRef: viewerRef, sidebarRef });

  // Keep ref in sync so event listeners always see the current active tab
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // Sync the "Open Recent" submenu once on mount with whatever was persisted.
  useEffect(() => {
    void invoke("update_recent_menu", { paths: useAppStore.getState().recentFiles });
  }, []);

  // Sync native menu checkmarks whenever theme changes.
  useEffect(() => {
    invoke("set_menu_theme", { theme });
  }, [theme]);

  async function handleCloseTab(docId: number) {
    await invoke("close_document", { docId });
    useAppStore.getState().removeTab(docId);
    if (useAppStore.getState().tabs.length === 0) {
      void invoke("set_pdf_menus_enabled", { enabled: false });
      useAppStore.getState().setInfoPanelOpen(false);
    }
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
    const m = activeTabRef.current;
    if (!m) return;
    const savePath = path ?? m.path;
    try {
      await invoke("save_document", { docId: m.docId, path: savePath });
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
    const m = activeTabRef.current;
    if (!m) return;
    try {
      const next = await invoke<DocumentManifest>("undo_document", { docId: m.docId });
      // Update the tab's canUndo/canRedo from the returned manifest
      useAppStore.setState((s) => ({
        tabs: s.tabs.map((t) =>
          t.docId === next.doc_id
            ? { ...t, canUndo: next.can_undo, canRedo: next.can_redo }
            : t
        ),
      }));
    } catch (e) {
      showError(String(e));
    }
  }

  async function handleRedo() {
    const m = activeTabRef.current;
    if (!m) return;
    try {
      const next = await invoke<DocumentManifest>("redo_document", { docId: m.docId });
      useAppStore.setState((s) => ({
        tabs: s.tabs.map((t) =>
          t.docId === next.doc_id
            ? { ...t, canUndo: next.can_undo, canRedo: next.can_redo }
            : t
        ),
      }));
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
    // Deduplicate: if already open, just switch to it
    const existing = useAppStore.getState().tabs.find((t) => t.path === path);
    if (existing) {
      handleSwitchTab(existing.docId);
      return;
    }
    setLoading(true);
    try {
      const m = await invoke<DocumentManifest>("open_document", { path });
      useAppStore.getState().addTab(m);
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

  function handleSwitchTab(docId: number) {
    useAppStore.getState().setActiveDocId(docId);
    // Scroll to the restored activePage after the virtualizer remounts
    requestAnimationFrame(() => {
      viewerRef.current?.scrollToPage(useAppStore.getState().activePage);
    });
  }

  function navigateTabs(direction: 1 | -1) {
    const { tabs, activeDocId } = useAppStore.getState();
    if (tabs.length < 2) return;
    const idx = tabs.findIndex((t) => t.docId === activeDocId);
    if (idx === -1) return;
    const next = tabs[(idx + direction + tabs.length) % tabs.length];
    useAppStore.getState().setActiveDocId(next.docId);
    requestAnimationFrame(() => {
      viewerRef.current?.scrollToPage(useAppStore.getState().activePage);
    });
  }

  function jumpToTab(n: number) {
    const { tabs } = useAppStore.getState();
    if (tabs.length === 0) return;
    const target = tabs[Math.min(n - 1, tabs.length - 1)];
    useAppStore.getState().setActiveDocId(target.docId);
    requestAnimationFrame(() => {
      viewerRef.current?.scrollToPage(useAppStore.getState().activePage);
    });
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
      if ((e.metaKey || e.ctrlKey) && e.key === "a" && !isInputFocused(e.target)) {
        const m = activeTabRef.current;
        if (m) {
          e.preventDefault();
          useAppStore.getState().selectAll(m.pageCount);
        }
      }
      // ⌘⇧] / ⌘⇧[ — next/prev tab (Mac; key is "}"/"}" because Shift+]/[ on US layout)
      if (e.metaKey && e.key === "}") { e.preventDefault(); navigateTabs(1); }
      if (e.metaKey && e.key === "{") { e.preventDefault(); navigateTabs(-1); }
      // Ctrl+Tab / Ctrl+Shift+Tab — next/prev tab (Windows/Linux)
      if (e.ctrlKey && !e.metaKey && e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) navigateTabs(-1); else navigateTabs(1);
      }
      // ⌘1–⌘9 / Ctrl+1–9 — jump to nth tab; ⌘9 / Ctrl+9 goes to last tab
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        jumpToTab(parseInt(e.key, 10));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Listen for native menu events forwarded from the Rust backend
  useEffect(() => {
    const unlistenOpen  = listen<void>("menu-open",  () => handleOpen());
    const unlistenClose = listen<void>("menu-close", () => {
      const { activeDocId } = useAppStore.getState();
      if (activeDocId !== null) void handleCloseTab(activeDocId);
    });
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
      const m = activeTabRef.current;
      if (m) useAppStore.getState().selectAll(m.pageCount);
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
    const unlistenNextTab = listen<void>("menu-next-tab", () => navigateTabs(1));
    const unlistenPrevTab  = listen<void>("menu-prev-tab",  () => navigateTabs(-1));
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
      unlistenNextTab.then((fn) => fn());
      unlistenPrevTab.then((fn) => fn());
    };
    // handleOpen is defined in render scope but only reads stable refs/setState.
    // Omitting from deps avoids re-registering listeners on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drag-and-drop: open PDFs dropped onto the window.
  // Use a ref for the unlisten function so the Strict Mode double-invoke
  // cleanup fires correctly even before the promise resolves.
  useEffect(() => {
    const cancelRef = { fn: null as (() => void) | null };
    const promise = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "enter" && event.payload.paths.length > 0) setIsDragOver(true);
      if (event.payload.type === "leave" || event.payload.type === "cancel") setIsDragOver(false);
      if (event.payload.type === "drop") {
        setIsDragOver(false);
        for (const path of event.payload.paths) {
          if (path.toLowerCase().endsWith(".pdf")) void handleOpenPath(path);
        }
      }
    });
    promise.then((fn) => {
      // If cleanup already ran before this resolved, unregister immediately
      if (cancelRef.fn === null) {
        cancelRef.fn = fn;
      } else {
        fn();
      }
    });
    return () => {
      if (cancelRef.fn) {
        cancelRef.fn();
      } else {
        // Mark as cancelled so the .then() above will immediately unregister
        cancelRef.fn = () => {};
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // SidebarProvider manages open/closed state, Cmd+B shortcut, and cookie
    // persistence. --sidebar-width overrides the default 16rem to a narrower
    // strip appropriate for page thumbnails.
    <SidebarProvider
      defaultOpen={true}
      className="h-screen overflow-hidden overscroll-none"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      {activeTab && (
        <Sidebar collapsible="offcanvas">
          <PageSidebar
            docId={activeTab.docId}
            pageSizes={activeTab.pageSizes}
            onScrollToPage={(i) => viewerRef.current?.scrollToPage(i)}
            onBugReport={openBugReportForError}
            containerRef={sidebarRef}
          />
        </Sidebar>
      )}

      <SidebarInset className="flex flex-col overflow-hidden">
        <Toolbar
          onOpen={handleOpen}
          loading={loading}
          hasDocument={activeTab !== null}
          isDirty={isDirty}
          canUndo={activeTab?.canUndo ?? false}
          canRedo={activeTab?.canRedo ?? false}
          onSave={handleSave}
          onUndo={handleUndo}
          onRedo={handleRedo}
          infoPanelOpen={infoPanelOpen}
          onToggleInfo={toggleInfoPanel}
        />

        {tabs.length > 0 && (
          <TabBar
            tabs={tabs}
            activeDocId={activeDocId}
            onSwitch={handleSwitchTab}
            onClose={(docId) => void handleCloseTab(docId)}
            onReorder={reorderTabs}
          />
        )}

        <div className="relative flex-1 overflow-hidden min-h-0">
          {activeTab ? (
            <PageViewer
              key={activeDocId}
              ref={viewerRef}
              docId={activeTab.docId}
              pageSizes={activeTab.pageSizes}
            />
          ) : (
            <EmptyState onOpen={handleOpen} />
          )}
          {isDragOver && (
            <div className="absolute inset-0 ring-2 ring-blue-500 ring-inset bg-blue-500/10 pointer-events-none" />
          )}
        </div>

        <StatusBar pageCount={activeTab?.pageCount} />
      </SidebarInset>

      {activeTab && (
        <InfoPanel
          docId={activeTab.docId}
          filename={activeTab.filename}
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
