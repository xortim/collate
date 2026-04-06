import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

interface DocumentManifest {
  doc_id: number;
  page_count: number;
  filename: string;
}

function App() {
  const [manifest, setManifest] = useState<DocumentManifest | null>(null);
  const [pageImage, setPageImage] = useState<string | null>(null);
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
    setPageImage(null);
    setManifest(null);

    try {
      const m = await invoke<DocumentManifest>("open_document", { path });
      setManifest(m);

      const imageData = await invoke<string>("get_page_image", {
        docId: m.doc_id,
        pageIndex: 0,
        width: 900,
      });

      setPageImage(`data:image/png;base64,${imageData}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ fontFamily: "sans-serif", padding: "1rem" }}>
      <button onClick={handleOpen} disabled={loading}>
        {loading ? "Loading…" : "Open PDF"}
      </button>

      {error && (
        <p style={{ color: "red", marginTop: "0.5rem" }}>{error}</p>
      )}

      {manifest && (
        <p style={{ marginTop: "0.5rem" }}>
          <strong>{manifest.filename}</strong> — {manifest.page_count} page
          {manifest.page_count !== 1 ? "s" : ""}
        </p>
      )}

      {pageImage && (
        <img
          src={pageImage}
          alt="Page 1"
          style={{ display: "block", marginTop: "1rem", maxWidth: "100%" }}
        />
      )}
    </main>
  );
}

export default App;
