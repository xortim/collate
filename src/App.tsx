import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { PageViewer } from "./components/PageViewer";

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

  async function handleOpen() {
    const path = await openDialog({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });

    if (!path) return;

    setLoading(true);
    setError(null);
    setManifest(null);

    try {
      const m = await invoke<DocumentManifest>("open_document", { path });
      setManifest(m);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Toolbar */}
      <header className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        <button
          onClick={handleOpen}
          disabled={loading}
          className="px-3 py-1.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Opening…" : "Open PDF"}
        </button>

        {manifest && (
          <span className="text-sm text-gray-600 truncate">
            <span className="font-medium text-gray-900">{manifest.filename}</span>
            {" — "}
            {manifest.page_count} page{manifest.page_count !== 1 ? "s" : ""}
          </span>
        )}

        {error && (
          <span className="text-sm text-red-600 truncate">{error}</span>
        )}
      </header>

      {/* Viewer */}
      <main className="flex-1 overflow-hidden">
        {manifest ? (
          <PageViewer docId={manifest.doc_id} pageSizes={manifest.page_sizes} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Open a PDF to get started
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
