# Collate — Architecture

**Version:** 0.1.0 (Draft)
**Author:** Tim Earle
**Last Updated:** 2026-04-05
**Status:** Draft — under active development

---

## 1. System Overview

Collate is a Tauri v2 application. The Rust backend owns all PDF state and manipulation. The React frontend is a view layer that renders thumbnails, captures user interactions, and sends commands to the backend via Tauri's IPC bridge.

```
┌─────────────────────────────────────────────────────┐
│                    Tauri Window                      │
│  ┌───────────────────────────────────────────────┐  │
│  │              React + TypeScript                │  │
│  │                                                │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐   │  │
│  │  │ Viewer   │ │ Page Mgr │ │ Form Overlay │   │  │
│  │  │ Component│ │ Component│ │ Component    │   │  │
│  │  └────┬─────┘ └────┬─────┘ └──────┬───────┘   │  │
│  │       │             │              │           │  │
│  │  ┌────▼─────────────▼──────────────▼───────┐   │  │
│  │  │         Tauri IPC (invoke / listen)      │   │  │
│  │  └────┬────────────────────────────────────┘   │  │
│  └───────┼────────────────────────────────────────┘  │
│          │                                           │
│  ┌───────▼────────────────────────────────────────┐  │
│  │              Rust Backend                       │  │
│  │                                                 │  │
│  │  ┌─────────────┐  ┌────────────┐  ┌──────────┐ │  │
│  │  │ Workspace   │  │ PDF Engine │  │ Thumbnail│ │  │
│  │  │ (state,     │  │ (lopdf,    │  │ (pdfium- │ │  │
│  │  │  undo/redo, │  │  page tree │  │  render) │ │  │
│  │  │  commands)  │  │  ops)      │  │          │ │  │
│  │  └─────────────┘  └────────────┘  └──────────┘ │  │
│  │                                                 │  │
│  │  ┌─────────────┐  ┌────────────┐               │  │
│  │  │ Form Engine │  │ OCR Engine │               │  │
│  │  │ (AcroForm,  │  │ (Tesseract │               │  │
│  │  │  XFA)       │  │  bindings) │               │  │
│  │  └─────────────┘  └────────────┘               │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 1.1 Boundary Rules

- **Rust owns all PDF data.** The frontend never receives raw PDF bytes. It receives thumbnails (as image data), workspace state (as JSON), and form field descriptors (as typed structs).
- **Frontend owns all interaction.** Drag-and-drop, selection, keyboard events, and view layout are React's domain. User actions are translated into commands sent to the backend.
- **IPC is the contract.** Tauri `invoke` commands are the API surface. Both sides are typed — Rust structs serialize to TypeScript types. If it's not in the IPC contract, it doesn't exist.

---

## 2. PDF Engine

The PDF engine is the core backend module. It wraps two libraries with distinct responsibilities:

**lopdf** — Structural operations. This is the library that reads and writes the PDF page tree, object dictionaries, AcroForm fields, and annotation objects. Every operation in the spec that modifies the PDF (rotate, delete, reorder, merge, fill form, add annotation) goes through lopdf. It operates on PDF objects directly — no rendering, no rasterization.

**pdfium-render** — Display operations. This is the library that rasterizes pages into bitmaps for the frontend. It is read-only from the PDF's perspective — it never modifies the document. Its sole job is producing images for thumbnails and the document viewer.

```
                  ┌─────────────────────┐
                  │     PDF Engine      │
                  │                     │
   Structural     │  ┌───────────────┐  │     Display
   operations     │  │               │  │     operations
 ─────────────────┼─▶│    lopdf      │  │
  rotate, delete, │  │               │  │
  reorder, merge, │  └───────────────┘  │
  fill form,      │                     │
  annotate, save  │  ┌───────────────┐  │
                  │  │  pdfium-render │──┼──▶ PNG/WebP bytes
                  │  │               │  │    to frontend
                  │  └───────────────┘  │
                  └─────────────────────┘
```

### 2.1 Document Representation

When a PDF is opened, lopdf parses it into an in-memory `Document` struct. Collate wraps this in its own `PdfDocument` struct that tracks:

- The lopdf `Document` handle
- The source file path
- A unique document ID (assigned at open time)
- Per-page metadata (original page index, current rotation, source identity)

Multiple open documents are stored in a `HashMap<DocId, PdfDocument>` behind a `Mutex` in Tauri's managed state.

### 2.2 Page Tree Operations

All page tree operations modify lopdf's in-memory document. No file I/O happens until the user explicitly saves or exports.

| Operation | lopdf mechanism |
|---|---|
| Rotate | Set `/Rotate` key in the page dictionary |
| Delete | Remove page reference from the page tree node |
| Reorder | Rebuild the `/Kids` array in the page tree root |
| Merge | Clone page objects from source document into target document's page tree |
| Split/Extract | Create a new `Document`, clone selected page objects into it |

### 2.3 Two-Library Coordination

lopdf and pdfium-render both need to read the same PDF, but they don't share an in-memory representation. On file open, both libraries load the PDF independently — lopdf gets the mutable structural copy, pdfium-render gets a read-only rendering copy.

After a structural mutation (rotate, delete, reorder), pdfium-render's copy is stale. To re-sync:

1. lopdf serializes the modified document to an in-memory byte buffer.
2. pdfium-render reloads from that buffer.
3. The thumbnail cache is invalidated for affected pages.

This re-serialize-and-reload cycle happens after every mutation. It is the simplest correct approach.

**Approach:** Start with re-serialize-and-reload on every mutation. This is the simplest correct implementation. If profiling during Phase 3 reveals serialization latency on large documents (target: < 50ms for 500 pages), refactor to lazy refresh — track dirty pages and only re-sync when a stale page is requested for rendering. Do not pre-optimize.

---

## 3. State Management

### 3.1 Where State Lives

State is split across two boundaries with a clear rule: **Rust owns document state, React owns UI state.**

| State | Owner | Examples |
|---|---|---|
| Document state | Rust | Page tree, page order, rotations, form field values, annotations, undo/redo stack |
| UI state | React | Which view is active, zoom level, scroll position, which pages are selected, drag-in-progress, active text box |

React never holds a copy of the page tree or form data. It holds a lightweight manifest — an ordered list of page IDs with enough metadata to render the UI (page dimensions, source label, rotation, thumbnail URL). When the user performs an action (reorder, rotate, delete), React sends a command to Rust, Rust mutates the document state, and Rust returns the updated manifest.

### 3.2 Workspace

The workspace is the top-level Rust struct that holds everything for an open session.

```
Workspace
├── documents: HashMap<DocId, PdfDocument>    // source files
├── page_list: Vec<PageRef>                   // ordered working set
├── undo_stack: Vec<Box<dyn Command>>         // executed commands
├── redo_stack: Vec<Box<dyn Command>>         // undone commands
├── save_points: Vec<usize>                   // indices into undo_stack
└── thumbnail_cache: HashMap<CacheKey, Bytes> // rendered thumbnails
```

`PageRef` is a lightweight pointer — it identifies a page by its source document ID and original page index, plus any current modifications (rotation). It does not contain PDF data.

```
PageRef {
    doc_id: DocId,
    original_page_index: usize,
    rotation: Rotation,  // None, CW90, CW180, CW270
}
```

### 3.3 Command Pattern (Undo/Redo)

Every user action that modifies document state is a command. A command knows how to execute itself and how to reverse itself.

```
trait Command {
    fn execute(&mut self, workspace: &mut Workspace) -> Result<()>;
    fn undo(&mut self, workspace: &mut Workspace) -> Result<()>;
    fn description(&self) -> &str;  // for UI: "Rotate 3 pages", "Delete page 5"
}
```

Example commands:

| Command | execute() | undo() |
|---|---|---|
| `ReorderPages` | Move pages to new positions in `page_list` | Restore previous positions |
| `RotatePages` | Set rotation on selected `PageRef`s | Restore previous rotation values |
| `DeletePages` | Remove `PageRef`s from `page_list`, store them internally | Re-insert stored `PageRef`s at original positions |
| `SetFormField` | Write new value to AcroForm field | Write previous value back |

The flow:

1. User drags page 5 to position 2.
2. React sends `reorder(page_ids, target_index)` via IPC.
3. Rust creates a `ReorderPages` command, calls `execute()`.
4. The command is pushed onto `undo_stack`. `redo_stack` is cleared.
5. Rust returns the updated page manifest to React.

Undo:

1. User presses Mod+Z.
2. React sends `undo()` via IPC.
3. Rust pops the last command from `undo_stack`, calls `undo()`.
4. The command is pushed onto `redo_stack`.
5. Rust returns the updated page manifest.

### 3.4 Save Points

When the user saves, Rust records the current length of the undo stack as a save point. The UI uses this to show "modified since last save" — if the current stack position differs from the last save point, the document is dirty.

Save does not clear or alter the undo stack. The user can undo past a save within the same session.

### 3.5 Dual Undo Contexts

Page operations and form/annotation edits have separate undo stacks. This prevents a page rotation from undoing a form field entry. This is a well-established pattern (contextual undo / scoped undo stacks) used in Adobe products, Microsoft Office, and other multi-domain editing applications.

```
Workspace
├── page_undo_stack: Vec<Box<dyn Command>>
├── page_redo_stack: Vec<Box<dyn Command>>
├── content_undo_stack: Vec<Box<dyn Command>>   // forms + annotations
└── content_redo_stack: Vec<Box<dyn Command>>
```

The active context is determined by what the frontend reports the user is doing:
- Thumbnail/page interaction → page undo stack
- Form field or annotation interaction → content undo stack

React includes a `context: "page" | "content"` field in the undo/redo IPC call.

---

## 4. Thumbnail Pipeline

### 4.1 Overview

Thumbnails are the primary visual interface for page navigation, the Page Manager view, and the sidebar. They are the most frequently requested asset from the backend. The pipeline must be fast, cached, and lazy.

### 4.2 Rendering

pdfium-render rasterizes a single page at a requested resolution and returns a bitmap. Collate encodes the bitmap to WebP and returns the bytes to the frontend.

```
Frontend requests thumbnail
        │
        ▼
Cache lookup (file_hash + page_index + rotation)
        │
    ┌───┴───┐
    │ Hit   │ Miss
    ▼       ▼
 Return   pdfium-render: rasterize page
 cached     │
 bytes      ▼
          Encode to WebP
            │
            ▼
          Store in cache
            │
            ▼
          Return bytes
```

### 4.3 Resolution Tiers

Not every context needs the same image size. Rendering at a single resolution wastes either bandwidth (too large for thumbnails) or clarity (too small for the viewer).

| Context | Target width | Use case |
|---|---|---|
| Sidebar nav | ~150px | Small page number strip in Document View |
| Page Manager grid | ~250px | Thumbnail grid for drag-and-drop |
| Document Viewer | Viewport-dependent | Full page render, scales with zoom level |

The frontend requests a specific width. The backend renders at that width, maintaining aspect ratio. The cache key includes the width tier so a sidebar thumbnail doesn't evict a viewer render.

### 4.4 Cache

The thumbnail cache lives in Rust memory with optional disk spillover for large sessions.

**Cache key:** `(file_content_hash, page_index, rotation, width_tier)`

**Invalidation rules:**
- Page rotated → invalidate all tiers for that page
- Page deleted → evict that page's entries
- Pages reordered → no invalidation needed (reorder doesn't change page content)
- Document re-serialized after mutation → invalidate affected pages only, not the entire document
- Document closed → evict all entries for that document

**Eviction:** LRU. Cap total cache size at a configurable limit (default: 256MB in memory). For long sessions with many large documents, spill least-recently-used entries to the OS temp directory.

### 4.5 Lazy Loading

The frontend only requests thumbnails for pages visible in the current viewport, plus a small buffer (one screenful above and below). This is handled by a virtual scrolling component in React.

The request flow:

1. React's virtual scroller determines which page IDs are visible.
2. For each visible page without a loaded thumbnail, React calls `get_thumbnail(page_id, width_tier)` via IPC.
3. Rust returns the image bytes (from cache or freshly rendered).
4. React creates a blob URL and renders the `<img>`.
5. When a page scrolls out of the buffer zone, React revokes the blob URL to free browser memory.

### 4.6 Viewer Rendering

The Document Viewer uses the same pipeline at a higher resolution. When the user is reading a document, the frontend requests a full-width render matching the viewport. On zoom, it re-requests at the new resolution.

**Zoom debouncing:** During a pinch-to-zoom or scroll-wheel zoom, don't fire a new render request on every frame. Debounce to 150ms after the last zoom event. Show the current image scaled (slightly blurry) as a placeholder until the sharp re-render arrives.

**Prefetch:** When viewing page N, prefetch pages N+1 and N-1 at the current resolution. This makes page-to-page scrolling feel instant.

### 4.7 Performance Budget

Per the spec:

- Thumbnail render (sidebar/grid): < 200ms per page
- Document viewer render: < 300ms per page at full viewport width
- Cache lookup and return: < 5ms

If any of these budgets are exceeded during Phase 1 prototyping, profile pdfium-render first — the encoding step (bitmap → WebP) is the most likely bottleneck. JPEG is a fallback if WebP encoding is too slow, trading file size for speed.

---

## 5. Form Engine

### 5.1 Overview

The form engine reads form field definitions from the PDF, sends them to the frontend as structured data, and writes user input back into the PDF on save. The frontend renders HTML input elements positioned over the page image. The backend never renders form fields into the page bitmap — they are always an overlay.

### 5.2 Field Detection

On document open, lopdf inspects the PDF's root catalog for an `/AcroForm` dictionary. If present, Collate walks the field tree and extracts a descriptor for each field.

```
FieldDescriptor {
    field_id: String,          // unique ID (from /T key or generated)
    field_type: FieldType,     // Text, Checkbox, Radio, Dropdown, Signature
    page_index: usize,         // which page this field appears on
    rect: Rect,                // position and size in PDF coordinates
    current_value: Option<String>,
    default_value: Option<String>,
    options: Vec<String>,      // for dropdowns and radio groups
    flags: FieldFlags,         // read-only, required, multiline, etc.
    font_info: Option<FontInfo>, // font name, size, color from /DA string
    tab_order: usize,          // field ordering for Tab navigation
}
```

The full list of `FieldDescriptor`s is sent to the frontend as part of the page manifest. React uses this to render overlay inputs.

### 5.3 Coordinate Mapping

PDF coordinates and browser coordinates are different systems. PDF uses a bottom-left origin with points (1/72 inch). The browser uses a top-left origin with pixels.

The backend performs the conversion. Each `FieldDescriptor.rect` is returned in **normalized coordinates** — percentages of the page width and height (0.0 to 1.0). The frontend positions the HTML input as a percentage-based absolutely positioned element inside the page image container.

This decouples field positioning from zoom level and viewport size. At any zoom, the overlay stays aligned.

```
PDF rect: {x: 72, y: 650, width: 200, height: 20}
Page size: 612 x 792 points (Letter)

Normalized:
  left:   72 / 612  = 0.1176
  bottom: 650 / 792 = 0.8207
  top:    1.0 - (650 + 20) / 792 = 0.1540  // flip Y axis
  width:  200 / 612 = 0.3268
  height: 20 / 792  = 0.0253
```

### 5.4 Frontend Overlay

React renders each field as an HTML element absolutely positioned inside the page container:

| Field type | HTML element |
|---|---|
| Text | `<input type="text">` or `<textarea>` (if multiline flag set) |
| Checkbox | `<input type="checkbox">` |
| Radio | `<input type="radio">` with shared `name` per group |
| Dropdown | `<select>` with `<option>`s from `field.options` |
| Signature | `<div>` with "Signature (not supported)" label, non-interactive |

Fields inherit font size and style from `FontInfo` when available. The overlay inputs are styled to blend with the page — minimal borders, transparent background, matching text size.

### 5.5 Writing Values Back

When the user modifies a field value, React sends the update to Rust:

```
set_form_field(doc_id, field_id, new_value)
```

Rust locates the field in lopdf's AcroForm dictionary and writes the new value. This is an in-memory mutation — no file I/O until save.

The corresponding `SetFormField` command stores the previous value so it can be undone (Section 3.3).

### 5.6 Save and Flatten

**Save (default):** lopdf writes the document with form fields intact and values populated. The output PDF has editable fields — anyone can open it and change the values.

**Flatten (export option):** lopdf renders field values into the page content stream and removes the AcroForm dictionary. The output PDF has no editable fields — the values are baked into the page as static text. This is what most court filings expect.

**Flattening implementation:** Attempt manual flattening via lopdf first — write text-rendering operators directly into the page content stream. If font encoding and glyph positioning complexity is prohibitive, fall back to pdfium-render rasterization for the flattening export path only. The default save (non-flattened) never rasterizes regardless.

Flattening is a one-way operation on the exported file. The working copy in Collate retains editable fields.

### 5.7 XFA Handling

XFA forms embed an XML schema that defines the form layout separately from the PDF page tree. lopdf can access the raw XFA XML, but interpreting and rendering it is a significantly harder problem than AcroForm.

**v1 strategy:**

1. On open, check for `/XFA` key in the AcroForm dictionary.
2. If present, attempt to extract field definitions from the XFA XML.
3. If extraction succeeds, present fields using the same overlay mechanism.
4. If extraction fails or the XFA layout is too complex to map, trigger the degraded capability indicator: "This form uses XFA formatting. Some fields may not display correctly."
5. The user can still view and print the document. Form filling may be partial or unavailable.

XFA is the highest-risk area of the form engine. Expect iterative improvement driven by real-world bug reports from the user.

### 5.8 Gotchas

- **Field appearance streams.** Some PDFs include pre-rendered appearance streams (`/AP`) for form fields. When Collate writes a new value, it must also update or remove the appearance stream, or the old value will show in other PDF readers. Start by removing `/AP` on write and letting the target reader regenerate it. Automate validation by saving the filled PDF, reopening with pdfium-render, and extracting text from the rendered page at the field's coordinates — if the written value is present, the appearance stream is correct. If any target reader fails to regenerate, Collate must generate its own appearance stream.
- **Font availability.** If a form field specifies a font not embedded in the PDF and not available on the system, the rendered text in the overlay may not match what Acrobat would show. Fall back to a metrically similar font and document the limitation.
- **Field calculation order.** Some forms define a calculation order (`/CO` in the AcroForm dictionary) for auto-calculating fields. Collate does not execute PDF JavaScript, so calculated fields will not auto-update. This is a known limitation (spec Section 6.7).
- **Radio button groups.** Radio buttons are grouped by their `/T` (field name) key. All buttons with the same `/T` are part of one group. Selecting one must deselect the others in the group. This grouping is defined in the PDF, not inferred.

---

## 6. IPC Contract

### 6.1 Overview

The IPC layer is the API boundary between Rust and React. Every interaction crosses this boundary exactly once in each direction — React invokes a Tauri command, Rust processes it and returns a typed response. There are no WebSocket connections, no polling loops, no shared memory.

Tauri's `invoke` system handles serialization automatically. Rust structs with `#[derive(Serialize)]` become TypeScript types. Both sides stay typed.

### 6.2 Commands

Commands are grouped by domain. Each command is a Rust function annotated with `#[tauri::command]`.

**Document Management**

| Command | Args | Returns | Description |
|---|---|---|---|
| `open_document` | `path: String` | `DocumentManifest` | Open a PDF, return its manifest |
| `close_document` | `doc_id: DocId` | `()` | Close a document, free resources |
| `get_recent_files` | — | `Vec<RecentFile>` | List recently opened files |

**Rendering**

| Command | Args | Returns | Description |
|---|---|---|---|
| `get_page_image` | `doc_id, page_index, width` | `Vec<u8>` | Render a page at the requested width, return WebP bytes |
| `get_thumbnail` | `page_id, width_tier` | `Vec<u8>` | Render a thumbnail, return cached or fresh WebP bytes |

**Workspace (Page Operations)**

| Command | Args | Returns | Description |
|---|---|---|---|
| `get_workspace` | — | `WorkspaceManifest` | Current page order, metadata, dirty state |
| `reorder_pages` | `page_ids: Vec<PageId>, target_index: usize` | `WorkspaceManifest` | Move pages to new position |
| `rotate_pages` | `page_ids: Vec<PageId>, degrees: i32` | `WorkspaceManifest` | Rotate selected pages |
| `delete_pages` | `page_ids: Vec<PageId>` | `WorkspaceManifest` | Remove pages from working set |
| `split_at` | `page_id: PageId` | `WorkspaceManifest` | Mark a split point |
| `undo` | `context: UndoContext` | `WorkspaceManifest` | Undo last action in the given context |
| `redo` | `context: UndoContext` | `WorkspaceManifest` | Redo last undone action |

**Form Operations**

| Command | Args | Returns | Description |
|---|---|---|---|
| `get_form_fields` | `doc_id` | `Vec<FieldDescriptor>` | All form fields with positions and current values |
| `set_form_field` | `doc_id, field_id, value` | `FieldDescriptor` | Set a field value, return updated descriptor |

**Annotation Operations**

| Command | Args | Returns | Description |
|---|---|---|---|
| `add_annotation` | `doc_id, page_index, annotation: AnnotationInput` | `AnnotationDescriptor` | Place a new text annotation |
| `update_annotation` | `doc_id, annotation_id, changes: AnnotationUpdate` | `AnnotationDescriptor` | Modify position, size, or content |
| `delete_annotation` | `doc_id, annotation_id` | `()` | Remove an annotation |
| `get_annotations` | `doc_id, page_index` | `Vec<AnnotationDescriptor>` | All annotations for a page |

**Export**

| Command | Args | Returns | Description |
|---|---|---|---|
| `save` | `doc_id, path: Option<String>` | `SaveResult` | Save to file. If path is None, prompt via native dialog. |
| `export_merged` | `path: String` | `SaveResult` | Export current workspace as a single PDF |
| `export_split` | `base_path: String` | `Vec<SaveResult>` | Export split sections as separate files |
| `export_flattened` | `doc_id, path: String` | `SaveResult` | Export with forms and annotations flattened |

**Print**

| Command | Args | Returns | Description |
|---|---|---|---|
| `print` | `doc_id` | `()` | Trigger OS-native print dialog for the document |

**System**

| Command | Args | Returns | Description |
|---|---|---|---|
| `submit_bug_report` | `description: String, screenshot: Option<Vec<u8>>` | `BugReportResult` | Open pre-filled GitHub Issue in browser |
| `get_app_info` | — | `AppInfo` | Version, OS, config path (included in bug reports) |

### 6.3 Return Types

Every mutation command returns the updated `WorkspaceManifest` so React can re-render in a single pass without a follow-up query.

```
WorkspaceManifest {
    pages: Vec<PageManifestEntry>,
    is_dirty: bool,
    can_undo: bool,
    can_redo: bool,
    undo_description: Option<String>,  // "Rotate 3 pages"
    redo_description: Option<String>,  // "Delete page 5"
    degraded: Vec<DegradedCapability>, // active warnings
}

PageManifestEntry {
    page_id: PageId,
    source_doc_id: DocId,
    source_filename: String,
    original_page_index: usize,
    width_points: f64,
    height_points: f64,
    rotation: i32,
    has_form_fields: bool,
    has_annotations: bool,
}
```

### 6.4 Error Handling

Every command returns `Result<T, CollateError>`. Errors are serialized to the frontend as structured objects, not strings.

```
CollateError {
    code: ErrorCode,       // FileNotFound, PdfParseError, EncryptedPdf, etc.
    message: String,       // human-readable, suitable for display
    detail: Option<String>, // technical detail for bug reports
}
```

React surfaces errors according to their severity:
- **Blocking** (can't open file, can't save): modal dialog with the message.
- **Degraded** (XFA parsing failed, font substitution): status bar indicator per Section 6.8 of the spec.
- **Transient** (thumbnail render failed for one page): retry silently, log for bug report context.

### 6.5 Events (Backend → Frontend)

Most communication is request/response. A few cases require the backend to push updates to the frontend:

| Event | Payload | Trigger |
|---|---|---|
| `ocr_progress` | `{ page_index, total_pages, status }` | During OCR processing |
| `file_changed_externally` | `{ doc_id, path }` | OS file watcher detects source file modified by another app |

Tauri's event system (`app.emit()` in Rust, `listen()` in React) handles these.

### 6.6 Design Rules

- **Every mutation returns the full manifest.** No partial updates, no delta patching. The manifest is small (a few KB even for 500 pages). Simplicity beats bandwidth optimization.
- **No frontend-initiated batch calls.** If the user selects 50 pages and rotates them, React sends one `rotate_pages` call with 50 IDs, not 50 individual calls.
- **IPC is synchronous from React's perspective.** Every `invoke()` is awaited. No fire-and-forget mutations. React updates after the response arrives.
- **Image bytes are the only binary payload.** Everything else is JSON-serialized structs.

---

## 7. Frontend Architecture

### 7.1 Overview

The frontend is a React + TypeScript single-page application running in Tauri's webview. It is a view layer — it renders state received from the backend and translates user interactions into IPC commands. It does not parse PDFs, manage undo history, or hold document data.

### 7.2 Component Tree

```
<App>
├── <TitleBar />                    // document name, dirty indicator
├── <MenuBar />                     // File, Edit, View, Tools, Help
├── <Toolbar />                     // action buttons, zoom control
├── <WorkspaceLayout>
│   ├── <DocumentView>              // active when View → Document View
│   │   ├── <PageSidebar />         // collapsible thumbnail nav strip
│   │   │   └── <SidebarThumbnail /> // draggable, right-click context menu
│   │   └── <PageViewer />          // scrollable rendered pages
│   │       ├── <PageImage />       // rasterized page from backend
│   │       ├── <FormFieldOverlay /> // positioned HTML inputs
│   │       └── <AnnotationOverlay /> // positioned text boxes
│   │
│   └── <PageManager>              // active when View → Page Manager
│       └── <ThumbnailGrid />      // drag-and-drop grid
│           └── <GridThumbnail />  // draggable, selectable, context menu
│
├── <StatusBar />                  // page count, zoom, degraded indicators
├── <ShortcutOverlay />            // triggered by ?, modal
└── <BugReportDialog />            // triggered by Help → Report a Bug
```

### 7.3 Key Libraries

| Library | Purpose | Rationale |
|---|---|---|
| **shadcn/ui** | UI components (buttons, menus, dialogs, dropdowns, tooltips, context menus) | Accessible by default (built on Radix), composable, TypeScript-first. Components are copied into the project — no framework lock-in. |
| **Tailwind CSS** | Styling | Required by shadcn/ui. Utility-first, consistent spacing/color, easy theme customization for light/dark OS matching. |
| **@dnd-kit/core + @dnd-kit/sortable** | Drag-and-drop for page reordering | Most mature React DnD library. Accessible, keyboard-supported, performant with large lists. |
| **@tanstack/react-virtual** | Virtual scrolling for page lists | Only renders visible pages. Critical for 500+ page documents. |
| **zustand** | UI state management | Minimal, no boilerplate, works well with TypeScript. Stores selection state, active view, zoom level — not document data. |

### 7.4 UI State (zustand)

```typescript
interface UIState {
  // View
  activeView: 'document' | 'pageManager';
  sidebarOpen: boolean;
  zoom: number;

  // Selection
  selectedPageIds: Set<string>;
  lastSelectedPageId: string | null;

  // Interaction modes
  activeMode: 'view' | 'annotate';
  focusedFieldId: string | null;

  // From backend (cached locally after each IPC response)
  workspace: WorkspaceManifest | null;
  formFields: Map<string, FieldDescriptor[]>;  // keyed by doc_id
}
```

This is the only store. No Redux, no context chains, no prop drilling through the component tree. Components subscribe to the slices they need.

### 7.5 Data Flow

Every user action follows the same cycle:

```
User interaction (click, drag, keypress)
        │
        ▼
React event handler
        │
        ▼
Tauri invoke(command, args)
        │
        ▼
Rust processes, returns WorkspaceManifest
        │
        ▼
zustand store updated with new manifest
        │
        ▼
Subscribed components re-render
```

There is one source of truth for document state (Rust) and one for UI state (zustand). They never conflict because they own different things.

### 7.6 Drag-and-Drop

dnd-kit handles page reordering in both the sidebar and the Page Manager grid.

**Interaction flow:**

1. User grabs a thumbnail (or a multi-selection).
2. dnd-kit tracks the drag. A ghost preview follows the cursor.
3. Drop indicators show where the page(s) will land.
4. On drop, React calls `reorder_pages(page_ids, target_index)`.
5. Rust executes the reorder, returns updated manifest.
6. React re-renders the list in the new order.

**Multi-select drag:** If the user has 5 pages selected and drags one, all 5 move together. The drag preview shows a stacked indicator ("5 pages").

**Cross-document drag (Page Manager):** When viewing all open documents combined, pages from different source files can be interleaved freely. Source tracking (Section 5.4 of the spec) ensures provenance is preserved.

### 7.7 Virtual Scrolling

Both the Document View and the Page Manager use `@tanstack/react-virtual` to render only visible content.

**Document View:** The virtual list contains page image containers. Each container has a known height (derived from page dimensions × zoom level). As the user scrolls, entering pages trigger `get_page_image` calls. Exiting pages have their blob URLs revoked.

**Page Manager:** The virtual grid contains thumbnail cells. Same lazy-loading pattern — thumbnails are fetched as they enter the viewport.

**Scroll position preservation:** When switching between Document View and Page Manager, the scroll position maps to the same page. If the user is looking at page 12 in Document View and switches to Page Manager, page 12 is scrolled into view.

### 7.8 Keyboard Handling

A single keyboard event handler at the `<App>` level captures all shortcuts. It checks the current context (is a form field focused? is a text annotation active?) and routes to the appropriate action.

```
Keypress received
    │
    ├── Form field or annotation focused?
    │   ├── Yes → standard text input behavior
    │   │         (except Mod+Z → content undo,
    │   │          Escape → exit field/annotation)
    │   │
    │   └── No → check shortcut map
    │       ├── Mod+Z → page undo
    │       ├── j/PgDn → next page
    │       ├── Delete/x → delete selected pages
    │       ├── ? → open shortcut overlay
    │       └── ... etc
    │
    └── Text input element focused (bug report, dialogs)?
        └── Pass through, no shortcut interception
```

Vim-style multi-key sequences (`gg`, `G`) use a short timeout buffer. If `g` is pressed and no second key arrives within 300ms, it's discarded.

### 7.9 Context Menus

Right-click on a thumbnail (sidebar or grid) opens a context menu. Built with shadcn/ui's context menu component (built on Radix).

| Menu Item | Action |
|---|---|
| Rotate Clockwise | `rotate_pages(selected, 90)` |
| Rotate Counter-Clockwise | `rotate_pages(selected, 270)` |
| Delete | `delete_pages(selected)` |
| Extract to New PDF | `export_extracted(selected)` |
| Split Here | `split_at(page_id)` |

The context menu respects multi-selection. If 5 pages are selected and the user right-clicks one of them, the action applies to all 5.

### 7.10 Document-Dependent UI State

Any interactive element — toolbar button, menu item, context menu item — that requires an open document must be **disabled** (not hidden) when no document is open. Examples: zoom controls, page navigation, File → Close, File → Print, all document-mutation actions.

**Rule:** derive enabled/disabled state from the zustand store's document presence. A single selector (`hasDocument`) is the source of truth; components must not invent their own ad-hoc checks.

```ts
// in the zustand store
const hasDocument = useDocumentStore(s => s.activeDocId !== null);

// in a component
<Button disabled={!hasDocument} onClick={handleClose}>Close</Button>
```

Hiding elements when no document is open is not acceptable — the user needs to know those actions exist. Disabled state with a tooltip explaining why is the correct pattern.

### 7.11 Form Field Rendering

For each page that has form fields, React renders a `<FormFieldOverlay>` positioned on top of the `<PageImage>`. The overlay contains absolutely positioned HTML inputs derived from the `FieldDescriptor` list.

```tsx
<div className="page-container" style={{ position: 'relative' }}>
  <img src={pageImageUrl} />
  <FormFieldOverlay
    fields={fieldsForThisPage}
    zoom={zoom}
    onFieldChange={(fieldId, value) =>
      invoke('set_form_field', { docId, fieldId, value })
    }
  />
</div>
```

Each input is positioned using the normalized coordinates from the backend (Section 5.3). Percentage-based positioning means the overlay scales automatically with zoom.

### 7.7 UI Conventions

**Long text truncation:** Use `middleTruncate(str, maxLength)` from `src/lib/truncate.ts` wherever long text needs to be shortened (filenames, paths, labels). It preserves both ends of the string and, for filenames, keeps the extension intact. Do not use the CSS `truncate` class for text that has semantic meaning at both ends.

---

## 8. Build & Distribution

### 8.1 Development Build

The development workflow runs two processes:

1. **Vite dev server** — serves the React frontend with hot module replacement.
2. **Tauri dev runner** — compiles the Rust backend and opens the native window pointing at the Vite dev server.

Tauri's CLI orchestrates both:

```
cargo tauri dev
```

This gives live reload on frontend changes and automatic Rust recompilation on backend changes.

### 8.2 Production Build

```
cargo tauri build
```

Tauri compiles the Rust backend in release mode, bundles the React frontend as static assets, and packages everything into platform-specific installers.

### 8.3 Platform Outputs

| Platform | Artifact | Notes |
|---|---|---|
| Windows | `.msi` installer + `.exe` | MSI registers file association. Unsigned initially — Windows SmartScreen will warn on first run. Code signing is a future concern. |
| macOS | `.dmg` containing `.app` bundle | Unsigned initially. Gatekeeper will require right-click → Open on first run. Notarization is a future concern. |
| Linux | `.deb` + `.AppImage` | `.deb` for Debian/Ubuntu. `.AppImage` for everything else. |

### 8.4 Code Signing

Not in scope for v1. The primary user (wife's Windows machine) will see a SmartScreen warning once on first install. Tim can walk her through it.

Future: Windows code signing via a certificate from SignPath or a similar service. macOS notarization via Apple Developer account. Evaluate cost vs. friction when distributing beyond the primary user.

### 8.5 File Association

Tauri supports file association declaration in `tauri.conf.json`:

```json
{
  "bundle": {
    "fileAssociations": [
      {
        "ext": ["pdf"],
        "mimeType": "application/pdf",
        "description": "PDF Document"
      }
    ]
  }
}
```

On Windows, the MSI installer registers Collate as an available handler for `.pdf` files. The user chooses to make it the default via Settings → Default Apps. Collate does not force the association.

When launched via file association, Tauri passes the file path as a CLI argument. The Rust backend reads it on startup and opens the document automatically.

### 8.6 OCR Data Bundling

Tesseract English language data (`eng.traineddata`, ~15MB) is bundled as a resource in the Tauri application bundle. At runtime, the Rust backend reads it from the bundled resources directory — no filesystem extraction, no post-install download.

Tauri's resource bundling is configured in `tauri.conf.json`:

```json
{
  "bundle": {
    "resources": [
      "resources/tessdata/eng.traineddata"
    ]
  }
}
```

### 8.7 CI Pipeline

Not in scope for v1. Tim builds locally and distributes manually.

Future candidate: GitHub Actions workflow that builds all three platform targets on push to `main`, uploads artifacts to a GitHub Release. Tauri has a well-documented GitHub Actions template for this.

### 8.8 Update Flow

v1: Tim builds a new `.msi`, sends it to his wife, she runs the installer. The MSI overwrites the previous install cleanly.

Future: Tauri's built-in updater plugin checks a GitHub Releases endpoint for new versions, downloads in the background, and prompts the user to restart. This is a well-trodden path in the Tauri ecosystem.

---

## 9. Testing Strategy

### 9.1 Overview

Testing follows strict TDD: write a failing test before writing any production code. A feature is not started until a test exists for it and not finished until that test passes.

Testing is split by boundary. Rust tests validate PDF operations and state management. Frontend tests validate interaction logic. Integration tests validate the IPC contract. Manual testing validates the UX — the user is the final QA gate.

### 9.2 Rust Unit Tests

Rust's built-in test framework (`#[cfg(test)]` modules) covers the backend. No external test runner needed. Write the `#[cfg(test)]` block with failing assertions before implementing the function under test.

| Module | What's tested | Example |
|---|---|---|
| PDF engine | Page tree operations produce correct output | Open a PDF, delete page 3, verify page count and remaining page order |
| Workspace | Page list manipulation, source tracking | Reorder pages, verify `PageRef` order and source IDs |
| Commands | Execute/undo symmetry | Execute a rotate command, undo it, verify page rotation is back to original |
| Undo/redo stack | Stack behavior, save points, dual context | Push 5 commands, undo 3, redo 1, verify stack state |
| Form engine | Field detection, value read/write | Open a form PDF, read field descriptors, set a value, verify it persists in the document |
| Thumbnail cache | Cache hit/miss, invalidation | Render a thumbnail, rotate the page, verify cache miss on next request |
| Coordinate mapping | PDF-to-normalized conversion | Known PDF rect on a Letter page, verify normalized output matches expected values |

### 9.3 Test Fixtures

A `tests/fixtures/` directory contains a curated set of PDFs covering the spec's edge cases:

| Fixture | Purpose |
|---|---|
| `simple_3page.pdf` | Basic operations — open, page count, reorder |
| `mixed_sizes.pdf` | Letter, Legal, and A4 pages in one document |
| `form_acroform.pdf` | Standard AcroForm with text, checkbox, radio, dropdown |
| `form_xfa.pdf` | XFA form for degraded mode testing |
| `form_readonly.pdf` | Form with pre-filled read-only fields |
| `form_js_calculated.pdf` | Form with JavaScript-dependent calculated fields |
| `scanned_raster.pdf` | Pages that are raster images in a PDF wrapper |
| `encrypted_user.pdf` | Password-protected PDF |
| `corrupted.pdf` | Malformed PDF that should trigger a clean error |
| `large_500page.pdf` | Performance testing for lazy loading and caching |
| `rotated_pages.pdf` | Pages with existing `/Rotate` entries |
| `mixed_sources_merged.pdf` | Previously merged document for source tracking tests |
| `annotations_freetext.pdf` | Document with existing `/FreeText` annotations |

These fixtures are committed to the repo. Generate them with a script where possible so they're reproducible.

### 9.4 Frontend Tests

Lightweight. The frontend is a view layer — most logic lives in Rust. Frontend tests cover interaction wiring, not business logic. Write the `*.test.tsx` file with failing assertions before writing the component.

| Scope | Tool | What's tested |
|---|---|---|
| Component rendering | Vitest + React Testing Library | Toolbar renders correct buttons, status bar shows page count, shortcut overlay opens on `?` |
| Keyboard routing | Vitest + React Testing Library | `j` triggers next page in view mode, passes through in form field focus |
| Selection model | Vitest | Click, Ctrl+Click, Shift+Click produce correct `selectedPageIds` |
| DnD integration | Manual | dnd-kit behavior is validated manually — automated drag simulation is brittle and low-value |

### 9.5 Integration Tests

Integration tests validate that the IPC contract works end-to-end — a React invoke produces the expected Rust response.

Tauri provides a test harness (`tauri::test`) that can invoke commands without starting the webview. Use this to:

1. Call `open_document` with a fixture path.
2. Call `rotate_pages` on page 1.
3. Call `get_workspace` and verify the manifest reflects the rotation.
4. Call `undo` and verify the rotation is reverted.

These tests exercise the full Rust stack (command handler → workspace → PDF engine → response) without touching the frontend.

### 9.6 Manual Testing Protocol

For every phase, the exit criteria in the spec define what "done" looks like. Manual testing validates these against real-world PDFs from the user's actual workflow.

**Phase 1 example:**
1. Double-click a PDF on the desktop. Collate opens and displays it.
2. Scroll through a 50-page document. No lag, no missing pages.
3. Zoom in and out. Text stays sharp at every level.
4. Print a document. Output matches what Acrobat produces.
5. Open 5 documents in tabs. Switch between them. No confusion.

**Phase 2 example:**
1. Open a state court form she uses weekly.
2. Fill every field. Tab between them.
3. Save. Reopen in Acrobat. Verify values display correctly.
4. Print the filled form. Verify it matches her current workflow output.

The user runs these tests. The bug reporting feature captures anything that fails.

### 9.7 What Is Not Tested

- Visual regression testing (screenshot comparison). Not worth the maintenance cost for a one-user app.
- End-to-end browser automation (Playwright, Cypress). The webview context in Tauri makes this fragile and slow.
- Performance benchmarking in CI. Performance is validated manually against the targets in the spec during development.

---

## 10. Open Questions

Decisions that need to be resolved before or during implementation. Each is tagged with the phase where the answer is needed.

### 10.1 lopdf vs pdf-rs (Phase 1)

**Decision: lopdf.** It has broader community adoption and direct dictionary access, which is critical for form field manipulation in Phase 2. pdf-rs is a fallback if lopdf proves insufficient.

### 10.2 Serialization Performance (Phase 3)

Low priority. The re-serialize-and-reload strategy (Section 2.3) is the default implementation. If profiling during Phase 3 reveals latency on real-world documents, optimize at that point. Do not pre-benchmark.

### 10.3 WebP Encoding Performance (Phase 1)

WebP is the preferred thumbnail format (small, modern, good quality). If encoding is a bottleneck, JPEG is the fallback.

**Resolution:** Benchmark both during Phase 1. Measure encode time per thumbnail at each resolution tier. Pick the one that stays under the 200ms budget.

### 10.4 Tauri v2 Webview Engines (Phase 1)

Tauri uses WebView2 on Windows (Chromium-based, ships with Edge), WebKit on macOS and Linux. There is no option to swap engines per platform. WebView2 on Windows is the most capable and best-tested backend — the primary user's platform is the lowest risk. WebKit on Linux is historically the weakest link but is the lowest-priority platform.

**Resolution:** Test on Windows first. Fix macOS and Linux issues as they surface.

### 10.5 Form Field Appearance Streams (Phase 2)

**Resolution:** Start by removing `/AP` on write and letting the target reader regenerate it. Test with Acrobat, Foxit, Chrome, and Edge. If any reader fails to regenerate, Collate must generate its own appearance stream.

**Testing:** Automate appearance stream validation by saving the filled PDF, reopening it with pdfium-render, and extracting text from the rendered page at the field's coordinates. If the written value is present in the extracted text, the appearance stream is correct. This is a string assertion, not an image diff — reliable and fast enough for CI.

### 10.6 Tesseract Rust Bindings Maturity (Phase 6)

`leptess` and `tesseract-rs` exist but have varying levels of maintenance. The bindings must support position-mapped text output (not just raw text) and bundled `traineddata` loading.

**Resolution:** Evaluate both crates before Phase 6. If neither is adequate, consider building a thin FFI wrapper directly against Tesseract's C API using Rust's `bindgen`.

### 10.7 GitHub Issues API Authentication (All Phases)

**Decision: Pre-filled browser URL.** Help → Report a Bug opens the user's browser to a GitHub Issues URL pre-populated with the description, app version, OS info, and optional screenshot. The user clicks Submit on GitHub's web UI. No API token, no secrets in the binary. If the extra browser step proves annoying, upgrade to a PAT-based API call in a future version.

### 10.8 Flattening Implementation (Phase 2 / Phase 5)

**Decision: Manual flattening via lopdf first.** Write text-rendering operators directly into the page content stream. If font encoding and glyph positioning complexity is prohibitive, fall back to pdfium-render rasterization for the flattening export path only. The default save (non-flattened) never rasterizes. Document the fallback if used.

### 10.9 Single Instance Behavior (Phase 1)

**Decision: Single instance, new tab.** When Collate is already running and the user double-clicks a second PDF, the existing window opens it as a new tab. Implemented via Tauri's single-instance plugin.

---

## 11. Next Steps

### 11.1 Before Writing Code

- [ ] Commit `docs/SPEC.md` and `docs/ARCHITECTURE.md` to the `collate` repo
- [ ] Scaffold the Tauri v2 + React + TypeScript project (`cargo create-tauri-app`)
- [ ] Add shadcn/ui and Tailwind CSS to the frontend
- [ ] Add lopdf and pdfium-render to `Cargo.toml`
- [ ] Create the `tests/fixtures/` directory and generate or source the initial fixture PDFs
- [ ] Verify the dev loop works: `cargo tauri dev` opens a window with a hello-world React app

### 11.2 Phase 1 Milestones

Build in this order. Each milestone is a working checkpoint — the app does something usable at every step.

1. **Open and render a single page.** Rust loads a PDF with lopdf, renders page 1 with pdfium-render, sends the image bytes to React via IPC, React displays it in an `<img>` tag. Ugly, no chrome. Proves the pipeline works.

2. **Multi-page scrolling.** Virtual scrolling with `@tanstack/react-virtual`. Scroll through a 50-page document. Lazy thumbnail loading. Verify memory doesn't spike.

3. **Page sidebar.** Collapsible nav strip with mini-thumbnails. Click to jump to a page. Verify scroll position syncs.

4. **Zoom.** Fit page, fit width, manual zoom. Debounced re-render on zoom change. Verify text stays sharp.

5. **Tabbed multi-document.** Open multiple PDFs. Tab bar with filename, close button, dirty indicator. Verify switching tabs preserves scroll position per document.

6. **Print.** Trigger OS-native print dialog from Rust. Verify output matches the source document.

7. **Keyboard navigation.** j/k, PgUp/PgDn, Home/End, gg/G. Shortcut overlay on `?`.

8. **Chrome.** Menu bar, toolbar, status bar. Light/dark theme from OS. Window state persistence. Recent files.

9. **File association and single instance.** Register as `.pdf` handler. Double-click a second PDF, it opens as a new tab in the running instance.

10. **Dogfood.** Hand it to the user. She uses it as her default PDF viewer for a week. Collect feedback. Bug report feature is live at this point.

### 11.3 After Phase 1

Review Phase 1 feedback with the user before starting Phase 2. Her real-world usage will surface assumptions in the spec that need correction. Update the spec and architecture docs accordingly — they are living documents, not write-once artifacts.
