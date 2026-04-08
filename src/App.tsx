import { useEffect, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PageViewer, PageViewerHandle } from "./components/PageViewer";
import { PageSidebar } from "./components/PageSidebar";
import { Toolbar } from "./components/Toolbar";
import { StatusBar } from "./components/StatusBar";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useAppStore } from "@/store";
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const viewerRef = useRef<PageViewerHandle>(null);
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

  async function handleOpen() {
    const path = await openDialog({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });

    if (!path) return;

    setLoading(true);
    setError(null);

    if (manifest) {
      await invoke("close_document", { docId: manifest.doc_id });
    }
    setManifest(null);

    try {
      const m = await invoke<DocumentManifest>("open_document", { path });
      setManifest(m);
      useAppStore.getState().setActivePage(0);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // Listen for native menu events forwarded from the Rust backend
  useEffect(() => {
    const unlistenOpen = listen<void>("menu-open", () => handleOpen());
    const unlistenTheme = listen<string>("menu-theme", (e) =>
      setTheme(e.payload as "light" | "dark" | "system")
    );
    return () => {
      unlistenOpen.then((fn) => fn());
      unlistenTheme.then((fn) => fn());
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
        <Toolbar onOpen={handleOpen} loading={loading} />

        <Separator />

        {error && (
          <div className="px-3 py-1 text-sm text-destructive bg-destructive/10 shrink-0">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-hidden min-h-0">
          {manifest ? (
            <PageViewer
              ref={viewerRef}
              docId={manifest.doc_id}
              pageSizes={manifest.page_sizes}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-1 text-sm text-muted-foreground">
              <span>Open a PDF to get started</span>
              <span className="text-xs">File → Open… or ⌘O</span>
            </div>
          )}
        </div>

        <StatusBar pageCount={manifest?.page_count} />
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
