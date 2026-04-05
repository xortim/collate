# Collate — Product Specification

**Version:** 0.1.0 (Draft)
**Author:** Tim Earle
**Last Updated:** 2026-04-05
**Status:** Draft — under active development

---

## 1. Purpose & Target User

### 1.1 Problem

Adobe Acrobat Pro costs ~$23/month and bundles features a paralegal never touches. PDF24 is free but fragments every operation into a separate single-purpose app — rotate here, merge there, fill forms somewhere else. For someone filling state court forms and assembling document packets dozens of times a day, that friction is a real productivity tax.

### 1.2 What Collate Is

Collate is a lightweight, cross-platform desktop application that serves as both a **primary PDF viewer** and an editor for the core operations a paralegal actually uses — all in a single window:

- View and print PDF documents
- Fill form fields in existing PDFs
- Rearrange, rotate, delete, and merge pages across documents
- Split and extract pages into new PDFs
- Add freeform text annotations
- Report bugs directly to the development repo without leaving the app

It ships as a small native executable. No account, no subscription, no cloud dependency. It should be the app that opens when she double-clicks a `.pdf`.

### 1.3 Target User

A paralegal at a solo/small firm on Windows 11 Pro who:

- Opens, reads, and prints PDFs throughout the day as her primary document format
- Fills state-specific court and practice-area forms daily
- Assembles multi-document packets (exhibits, filings, discovery) regularly
- Has no IT support on-site — her husband (the developer) maintains the tool remotely via GitHub
- Values speed and simplicity over feature count
- Does not need OCR, redaction, e-signatures, or Bates numbering (yet)

### 1.4 Bug Reporting

The app includes a built-in **Help → Report a Bug** flow. The user fills a short form (description + optional screenshot), and Collate creates a GitHub Issue on the project repo automatically. She never needs to open a browser, log in, or know what a repo is.

---

## 2. Design Principles

1. **One window, one workflow.** Never force the user to switch apps for a related operation. If she opened Collate, she should be able to finish the task without leaving it.

2. **Default PDF viewer.** Collate must be fast and competent enough to register as the system's default `.pdf` handler. If it can't replace her current viewer, it's just another tool in the pile.

3. **Non-destructive by default.** No source file is modified until the user explicitly saves or exports. Every operation is reversible until that point.

4. **Structural manipulation only.** Page operations modify the PDF page tree — never re-render or rasterize page content. A page that goes in looking like X comes out looking like X.

5. **Visible state.** The user can always see what they're working with. No hidden pages, no mystery operations, no "processing..." without feedback.

6. **Fast startup.** Usable within 3 seconds of launch on commodity hardware. This is a tool she reaches for reflexively — any startup lag trains her to avoid it.

7. **Zero ceremony.** No account, no login, no telemetry, no cloud dependency, no license activation. Double-click and go.

8. **Mouse and keyboard are equals.** Every operation is fully usable by mouse alone or keyboard alone — neither is a second-class citizen. Keyboard navigation defaults to Vim conventions (`h/j/k/l`, `g/G`) with standard fallbacks (arrow keys, Home/End, Page Up/Down). An in-app shortcut reference (triggered by `?`) is required so the user can discover bindings without external help.

9. **Errors are conversations, not dead ends.** If a PDF can't be opened, say why and what to do about it. Never fail silently.

10. **The user is the QA team.** Bug reporting is a first-class feature, not an afterthought.

11. **Simple by default.** The UI assumes no technical expertise. Labels are plain English. Menus are shallow. If a feature needs explanation, the feature is too complicated.

12. **Degraded mode is visible.** When Collate cannot fully support a document's features, the user knows. A persistent, non-blocking indicator explains what's limited and why. No silent failures, no hidden footnotes.

13. **Three ways in.** Every tool and mode is accessible via menu bar, toolbar, and keyboard shortcut. No operation is locked behind a single input method.

14. **No shelling out.** All functionality is provided via linked libraries. Collate never invokes external CLI tools at runtime. This ensures consistent behavior, testability, and no hidden dependencies on the user's system PATH.

---

## 3. Scope

### 3.1 In Scope — by Phase

| Phase | Feature | Description |
|---|---|---|
| 1 | View PDF | Open, scroll, zoom, page-by-page and continuous view |
| 1 | Print | Print via OS-native print dialog |
| 2 | Fill form fields | Detect and fill existing AcroForm fields (text, checkbox, dropdown, radio) |
| 3 | Rearrange pages | Drag-and-drop reordering via thumbnail view |
| 3 | Rotate pages | 90° / 180° / 270° clockwise |
| 3 | Delete pages | Remove selected pages from working document |
| 3 | Merge documents | Combine multiple opened PDFs into one |
| 4 | Split document | Break a document at user-defined points |
| 4 | Extract pages | Export selected pages as a new PDF |
| 5 | Freeform text annotation | Place text boxes at arbitrary positions on a page |
| 6 | OCR | Extract text layer from rasterized/scanned pages for copy-paste |
| 7 | Form field creation | Add fillable fields to a document for others to complete |
| All | Bug reporting | In-app Help → Report a Bug, creates a GitHub Issue |
| All | Shortcut reference | `?` opens an in-app keybinding guide |

### 3.2 Out of Scope (v1)

These are explicitly not part of the initial release. Some are strong candidates for future versions, others are deliberately excluded.

| Feature | Future candidate? | Notes |
|---|---|---|
| Bates numbering | Yes | High value for litigation workflows. First post-v1 priority. |
| Autofill profiles / saved form data | Yes | Natural extension of form filling for repeated state forms |
| Page labels (e.g., "Exhibit A-1") | Yes | Useful for exhibit packet assembly |
| Bookmarks / TOC manipulation | Yes | Relevant for large document organization |
| Side-by-side document comparison | Maybe | Useful but significant UI complexity |
| Batch operations on folders | Maybe | Power user feature, scope carefully |
| Text editing of existing PDF content | No | Approaches full word processor territory. Out of charter. |
| Digital signatures | No | Legal and cryptographic complexity. Use a dedicated tool. |
| Redaction | No | High-risk feature — a bug means leaked privileged content. Use a certified tool. |
| Watermarking | No | Low frequency use case for this user |
| Password protection / encryption | No | OS and email tools handle this adequately |
| Cloud storage integration | No | Local-only by design |
| Mobile platforms | No | Desktop tool for desktop workflows |

---

## 4. User Workflows

### 4.1 View and Print a Document

1. User double-clicks a `.pdf` in Explorer (or opens via File → Open).
2. Collate opens and displays the document.
3. User reads, scrolls, zooms as needed.
4. User prints via Mod+P or File → Print. OS-native print dialog handles the rest.

### 4.2 Fill a Form

1. User opens a PDF containing form fields.
2. Collate detects the form fields and makes them interactive (highlighted, clickable).
3. User clicks into fields and fills them — text, checkboxes, dropdowns, radio buttons.
4. User tabs between fields in document order.
5. User saves the filled form (Mod+S → Save As by default, never overwrite source).
6. User prints or emails the saved file later.

### 4.3 Assemble a Document Packet

1. User opens 3-5 source PDFs (discovery docs, correspondence, filings).
2. Collate displays all open documents in a tabbed view.
3. User switches to Page Manager view or uses the sidebar thumbnails.
4. User drags pages from multiple sources into the desired order.
5. User rotates any pages that were scanned sideways.
6. User deletes blank or irrelevant pages.
7. User exports the result as a new PDF (e.g., `Exhibit_A.pdf`).

### 4.4 Split a Combined Document

1. User opens a single large PDF (e.g., a multi-hundred-page production).
2. User switches to Page Manager view or uses the sidebar thumbnails.
3. User marks split points between pages.
4. User exports each section as a separate file.

### 4.5 Annotate a Document

1. User activates the text annotation tool via the toolbar button, the menu bar (e.g., Tools → Text Annotation), or keyboard shortcut.
2. User clicks a position on the page and types.
3. User repositions or resizes the text box as needed.
4. User saves the annotated document.

### 4.6 Report a Bug

1. User hits something broken or confusing.
2. User goes to Help → Report a Bug.
3. A simple form appears: description (required), screenshot (optional — one-click capture).
4. User clicks Submit. Collate creates a GitHub Issue on the project repo.
5. User sees a confirmation. Done.

### 4.7 Edge Cases

- **Multiple documents open at once.** Collate supports multiple open documents via tabs.
- **Switching between views.** Document View is the default. Page Manager is a layout toggle, not a mode — all page operations are available in both views.
- **Unsaved changes on close.** Collate prompts before closing if there are unsaved modifications.
- **Large documents.** A 500+ page PDF must not lock the UI. Lazy rendering, progressive thumbnail loading, and a responsive scroll bar are requirements, not nice-to-haves.

---

## 5. Page Manipulation

All page operations are **structural**. Collate modifies the PDF page tree (ordering, rotation metadata, page references) — it never re-renders or rasterizes page content. What goes in is what comes out.

### 5.1 Operations

| Operation | Behavior |
|---|---|
| **Rearrange** | Drag-and-drop pages to new positions in the thumbnail view. Multi-select supported. |
| **Rotate** | Rotate selected page(s) by 90°, 180°, or 270° clockwise. Sets the `/Rotate` entry in the page dictionary. |
| **Delete** | Remove selected page(s) from the working document. Pages are removed from the page tree, not destroyed — undo restores them. |
| **Merge** | When multiple source PDFs are open, their pages appear in the workspace together. Export produces a single combined PDF. |
| **Split** | User marks split points between pages. Export produces multiple PDFs, one per section. |
| **Extract** | User selects specific pages and exports them as a new PDF. Source document is unchanged. |

### 5.2 Selection Model

- **Single click** selects a page (deselects others).
- **Ctrl+Click** toggles a page in/out of the selection.
- **Shift+Click** selects a contiguous range from the last selected page to the clicked page.
- **Ctrl+A** selects all pages.
- **Escape** deselects all.

### 5.3 Undo / Redo

Every operation listed in 5.1 is undoable. The undo stack holds references to affected pages so they can be restored, but **only the current working page tree is exported or saved.** Deleted pages exist only in the undo stack — they do not appear in any output.

**Save does not clear the undo stack.** The user can undo past a save point within the same session. Save inserts a marker in the stack so the UI can indicate "saved state" vs "modified since last save," but the full history remains navigable.

The stack clears when the document is closed.

| Action | Shortcut |
|---|---|
| Undo | Mod+Z / u |
| Redo | Mod+Shift+Z / Ctrl+R |

> **Convention:** `Mod` means Ctrl on Windows/Linux, Cmd on macOS. All keyboard shortcuts in this spec use this convention.

Undo/redo applies to page operations only. Form field edits have their own undo context (Section 6).

**Future candidate:** Persist the command stack to a sidecar file (`.collate-history`) for cross-session undo. The in-memory command stack architecture should not preclude this.

### 5.4 Source Tracking

Every page in the workspace retains a reference to its source file and original page number. This is displayed on or near the thumbnail so the user always knows where a page came from. When multiple documents are merged, source identity is never lost until export.

### 5.5 Gotchas

- **Mixed page sizes.** Legal workflows mix Letter, Legal, and A4 constantly. Thumbnails render at correct aspect ratios. Export preserves original page dimensions — no rescaling, no normalization.
- **Encrypted source PDFs.** If a source PDF is password-protected, Collate prompts for the password on open. If decryption fails, the file is rejected with a clear error naming the file and the problem.
- **Corrupted PDFs.** If the PDF parser cannot read a file, surface an error identifying the file and the failure reason. Do not partially load.
- **Page-level vs. document-level metadata.** Operations like delete and reorder affect the page tree. Document-level metadata (title, author, keywords) carries over from the first source document on export unless the user explicitly changes it. This is a reasonable default — revisit if it causes confusion.

---

## 6. Form Filling

### 6.1 Overview

Collate detects existing form fields in a PDF (AcroForm and XFA) and presents them as interactive, fillable elements overlaid on the rendered page. The user fills fields directly on the document — click, type, tab to the next field.

### 6.2 Supported Field Types

| Field Type | Behavior |
|---|---|
| Text field | Click to focus, type to fill. Supports single-line and multi-line. |
| Checkbox | Click to toggle. |
| Radio button | Click to select. Selecting one deselects others in the group. |
| Dropdown / combo box | Click to open, select from list. Editable combo boxes accept typed input. |
| Date field | Treat as text input. No custom date picker — the form defines the format, the user fills it. |
| Signature field | Display as read-only placeholder. Signing is out of scope (Section 3.2). |

### 6.3 Field Navigation

- **Tab** advances to the next field in document order.
- **Shift+Tab** moves to the previous field.
- If the PDF defines a custom tab order, Collate respects it.
- Clicking any field focuses it directly.

### 6.4 Visual Treatment

- Fillable fields are highlighted with a subtle background color when the document contains form fields. This is how the user discovers that a PDF is a form.
- The active/focused field has a distinct border.
- Filled fields show user input at the font size and style defined by the form. If the form specifies no font, fall back to a sensible default (e.g., Helvetica at the field's defined size).

### 6.5 Saving Filled Forms

- **Mod+S** saves the filled form. Default behavior is Save As — never overwrite the source file unless the user explicitly chooses to.
- Form data is written back into the PDF's AcroForm fields. The output is a standard filled PDF that any other PDF reader can open and display correctly.
- Flattening (baking field values into the page content so they're no longer editable) is available as an export option but not the default.

### 6.6 Undo / Redo (Form Context)

Form field edits have their own undo stack, separate from page manipulation. This prevents a page rotate from undoing a form field entry.

- Same keybindings: Mod+Z / u, Mod+Shift+Z / Ctrl+R.
- The active undo context is determined by what the user is doing — if they're in a form field, undo applies to form edits. If they're in thumbnail/page view, undo applies to page operations.

### 6.7 Gotchas

- **XFA forms.** XFA is a legacy Adobe format that many government and state-specific forms still use. It's poorly supported outside Acrobat. Collate must make a best-effort attempt to render and fill XFA forms, but XFA support is not guaranteed to be pixel-perfect. If an XFA form cannot be parsed, surface a clear error rather than rendering garbage.
- **Read-only fields.** Some forms have pre-filled read-only fields (e.g., court name, form number). Display them but do not make them editable.
- **JavaScript-driven forms.** Some PDFs use embedded JS for field validation or auto-calculation. Collate does not execute PDF JavaScript in v1. Fields that depend on JS logic will not auto-calculate. Flag this as a known limitation.
- **Font embedding.** If the form specifies a font not available on the system, Collate substitutes with a metrically similar fallback. Document this behavior so the user isn't surprised by minor rendering differences.

### 6.8 Degraded Capability Indicator

When Collate opens a document that uses features with limited or no support (XFA forms, JS-driven fields, unsupported encryption, etc.), the app must surface a **persistent, non-intrusive indicator** that the user is working with a degraded document.

Requirements:

- The indicator is visible without the user needing to look for it. Not a toast that disappears — something that stays on screen as long as the document is open.
- Clicking or hovering on the indicator explains *what* is degraded and *what that means* in plain language. Example: "This form uses XFA formatting. Some fields may not display correctly."
- The indicator does not block the user from working. It's informational, not a gate.
- Candidate locations: status bar icon, window title badge, or a subtle banner below the toolbar. Final placement is a UI decision (Section 9).

This pattern applies globally — any document-level limitation triggers the indicator, not just form-related ones.

---

## 7. Freeform Text Annotation

### 7.1 Overview

The user can place text boxes at arbitrary positions on any page. This is for adding notes, labels, or supplementary text to documents that don't have form fields — common when marking up correspondence, discovery documents, or filings that need a handwritten-style addition.

### 7.2 Interaction

1. User activates the text annotation tool via the toolbar button, the menu bar (e.g., Tools → Text Annotation), or keyboard shortcut.
2. User clicks a position on the page.
3. A text box appears at that position. User types.
4. User can reposition the box by dragging it.
5. User can resize the box by dragging its edges.
6. Clicking outside the box deactivates it. Clicking it again re-enters edit mode.
7. Pressing Escape exits annotation mode and returns to the default viewing mode.

### 7.3 Text Formatting

Keep it minimal. This is not a word processor.

| Property | Options |
|---|---|
| Font family | System default + 2-3 alternatives (e.g., Helvetica, Times, Courier) |
| Font size | Preset range (8pt–24pt) via dropdown or increment buttons |
| Color | Black (default), red, blue. Small fixed palette — no color picker in v1. |
| Bold / Italic | Toggle via toolbar or Mod+B / Mod+I |
| Alignment | Left-aligned only in v1 |

A compact formatting bar appears near the active text box when editing, or in the toolbar. One or the other — not both.

### 7.4 Annotation Storage

Text annotations are written as **PDF annotation objects** (`/Annot` with subtype `/FreeText`), not baked into the page content stream. This means:

- Annotations are editable after saving (reopen in Collate, click the annotation, edit it).
- Other PDF readers will display them as annotations (most modern readers handle `/FreeText` correctly).
- Flattening annotations into the page content is available as an export option, same as form flattening.

### 7.5 Undo / Redo

Text annotation operations (create, move, resize, delete, edit content) share the form undo stack — they're both "content edits" as opposed to page-level operations.

### 7.6 Gotchas

- **Annotation placement accuracy.** The click position must map correctly to the PDF coordinate system regardless of zoom level, page rotation, or page size. Off-by-a-few-pixels placement is a fast path to frustration.
- **Annotation on top of existing content.** Annotations render above the page content. If the user places text over existing text, both are visible. No automatic background/box behind the annotation in v1 — revisit if readability is a problem.
- **Export compatibility.** Verify that annotations created by Collate display correctly in Acrobat, Foxit, Chrome's PDF viewer, and Edge's PDF viewer. These are the readers she's most likely sending documents to.

---

## 8. OCR

### 8.1 Overview

OCR adds a transparent text layer to rasterized/scanned pages so the user can select and copy text. The visual content of the page is unchanged — OCR overlays machine-readable text on top of the existing raster image, matching position and size.

This is a convenience feature, not a production-grade document conversion pipeline. Accuracy depends on scan quality.

### 8.2 Interaction

1. User opens a PDF containing scanned/rasterized pages.
2. User attempts to select text on a page and can't (because there's no text layer).
3. The degraded capability indicator (Section 6.8) surfaces: "This page contains no selectable text. Run OCR to extract text?"
4. User triggers OCR via menu bar (Tools → Run OCR), toolbar, or keyboard shortcut.
5. User chooses scope: current page, selected pages, or entire document.
6. Collate processes the pages. A progress indicator shows status — this may take a few seconds per page.
7. When complete, the user can select and copy text normally.

### 8.3 Output

- OCR produces a **text layer overlay** on the existing page. The page content stream (the raster image) is untouched.
- The result is a searchable PDF — standard behavior, identical to what Acrobat's OCR produces.
- Saving after OCR writes the text layer into the PDF. This is a permanent enhancement, not a session-only overlay.

### 8.4 Engine

The OCR engine is integrated via Rust library bindings — no CLI shelling. Candidates include Tesseract (via `leptess` or `tesseract-rs`) and platform-native APIs. Requirements:

- Must support English. Language data for English is bundled with the install.
- Additional language packs may be downloadable in future versions. Not in scope for v1.
- Must run locally. No cloud OCR services.
- Must produce position-mapped text (not just a raw text dump) so the overlay aligns with the scanned content.

### 8.5 Gotchas

- **Performance.** OCR is slow relative to every other operation in Collate. A 50-page scanned document could take 30+ seconds. The UI must remain responsive during processing — run OCR in a background thread with a cancelable progress indicator.
- **Accuracy expectations.** OCR is imperfect. Low-quality scans, handwriting, unusual fonts, and skewed pages all degrade results. Collate does not promise accuracy — it provides a best-effort text layer. Do not surface a confidence score or per-word highlighting in v1.
- **Already-OCR'd pages.** If a page already has a text layer, skip it. Do not double-layer. Detect this by checking whether the page content stream contains text operators beyond the raster image.
- **Mixed documents.** A single PDF may contain both native text pages and scanned pages. OCR should target only the pages that need it, not reprocess the entire document blindly.

---

## 9. UI Layout & Behavior

### 9.1 Views

Collate has two views. Both provide full access to all page operations — the difference is layout, not capability.

| View | Layout | Use case |
|---|---|---|
| **Document View** | Full-page rendering with a collapsible page nav sidebar. | Reading, form filling, annotating. Page operations available via sidebar thumbnails (drag-and-drop, right-click context menu). |
| **Page Manager** | Thumbnail grid filling the main content area. | Bulk page work — rearranging large documents, merging multiple sources, spotting pages that need rotation. |

The user can rearrange, rotate, delete, split, and extract pages in either view. The Page Manager just makes it easier to work with many pages at once.

### 9.2 Document View Layout

```
┌──────────────────────────────────────────────────────────┐
│  ● ● ●  Collate — filename.pdf                     ─ □ × │
├──────────────────────────────────────────────────────────┤
│  Menu Bar  [File] [Edit] [View] [Tools] [Help]           │
├──────────────────────────────────────────────────────────┤
│  Toolbar  [Open] [Save] [Print] [Undo] [Redo]  | [Zoom] │
├──────┬───────────────────────────────────────────────────┤
│      │                                                   │
│  P   │                                                   │
│  a   │         Document Content                          │
│  g   │         (scrollable, zoomable)                    │
│  e   │                                                   │
│      │         ┌─────────────────────────┐               │
│  N   │         │                         │               │
│  a   │         │      Page N             │               │
│  v   │         │                         │               │
│      │         │                         │               │
│  1 ■ │         └─────────────────────────┘               │
│  2   │                                                   │
│  3   │         ┌─────────────────────────┐               │
│  4   │         │                         │               │
│  5   │         │      Page N+1           │               │
│      │         │                         │               │
│      │         └─────────────────────────┘               │
│      │                                                   │
├──────┴───────────────────────────────────────────────────┤
│  Status Bar  [Page 3 of 12] [100%]        [⚠ XFA form]  │
└──────────────────────────────────────────────────────────┘
```

- **Page Nav (left sidebar):** Narrow strip of mini-thumbnails or page numbers. Clicking jumps to that page. Collapsible. Supports drag-and-drop reordering and right-click context menu for page operations.
- **Document Content (center):** The rendered page(s). Supports continuous scroll and single-page view modes.
- **Status Bar (bottom):** Current page, zoom level, degraded capability indicators (Section 6.8).

### 9.3 Page Manager Layout

```
┌──────────────────────────────────────────────────────────┐
│  ● ● ●  Collate — Page Manager                    ─ □ × │
├──────────────────────────────────────────────────────────┤
│  Menu Bar  [File] [Edit] [View] [Tools] [Help]           │
├──────────────────────────────────────────────────────────┤
│  Toolbar  [Open] [Save] [Rotate ↻] [Rotate ↺] [Delete]  │
│           [Split Here] [Extract] [Undo] [Redo]           │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   ┌───────┐  ┌───────┐  ┌───────┐  ┌───────┐            │
│   │       │  │       │  │       │  │       │            │
│   │  P1   │  │  P2   │  │  P3   │  │  P4   │            │
│   │       │  │       │  │       │  │       │            │
│   │doc1.pdf  │doc1.pdf  │doc2.pdf  │doc2.pdf            │
│   └───────┘  └───────┘  └───────┘  └───────┘            │
│                                                          │
│   ┌───────┐  ┌───────┐  ┌───────┐                       │
│   │       │  │       │  │       │                       │
│   │  P5   │  │  P6   │  │  P7   │                       │
│   │       │  │       │  │       │                       │
│   │doc2.pdf  │doc3.pdf  │doc3.pdf                       │
│   └───────┘  └───────┘  └───────┘                       │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Status Bar  [7 pages] [3 sources] [Modified]  [⚠ XFA]  │
└──────────────────────────────────────────────────────────┘
```

- **Thumbnail grid:** Drag-and-drop reordering. Each thumbnail shows the page number and source file label.
- **Source identification:** Color-coded border or label per source document so the user can see at a glance which pages came from where.
- **Selection:** Per the selection model in Section 5.2.
- **Right-click context menu:** Rotate CW, Rotate CCW, Delete, Extract, Split Here.
- **Double-click:** Opens the page in Document View, scrolled to that page.

### 9.4 Multi-Document Handling

Multiple open documents are managed via **tabs** along the top of the document content area.

- Each tab shows the filename (truncated if necessary) and a close button.
- Unsaved/modified tabs show a dot indicator.
- In Page Manager view, the user can choose to view pages from a single document or all open documents combined (toggle in the toolbar).
- Dragging a page from one document's tab to another is supported in Page Manager view.

### 9.5 Theming

Collate follows the OS theme setting. Light on light, dark on dark. No manual theme toggle in v1.

### 9.6 Window Behavior

- Collate remembers window size and position between sessions.
- Standard CSD (client-side decorations) per platform — native title bar on Windows, native on macOS.
- Registers as a `.pdf` file handler on install so double-clicking a PDF opens Collate.

### 9.7 Keyboard Shortcuts

| Action | Shortcut | Vim |
|---|---|---|
| Open file | Mod+O | |
| Save | Mod+S | |
| Print | Mod+P | |
| Undo | Mod+Z | u |
| Redo | Mod+Shift+Z | Ctrl+R |
| Select all | Mod+A | |
| Delete selected | Delete | x |
| Rotate CW | Mod+R | |
| Rotate CCW | Mod+Shift+R | |
| Next page | PgDn | j |
| Previous page | PgUp | k |
| First page | Home | gg |
| Last page | End | G |
| Switch to Page Manager | Mod+M | |
| Switch to Document View | Mod+D | |
| Zoom in | Mod+= | |
| Zoom out | Mod+- | |
| Zoom to fit | Mod+0 | |
| Shortcut reference | ? | |

> **Convention:** `Mod` means Ctrl on Windows/Linux, Cmd on macOS.

### 9.8 Accessibility

- All toolbar actions have tooltip labels.
- Tab order through UI elements is logical and complete.
- Focus indicators are visible in both light and dark themes.
- WCAG 2.1 AA contrast ratios for all text and interactive elements.

---

## 10. Technical Constraints

### 10.1 Platform Targets

| Platform | Priority | Minimum version |
|---|---|---|
| Windows | Primary | Windows 10 22H2+ |
| macOS | Secondary | macOS 13 (Ventura)+ |
| Linux | Tertiary | Ubuntu 22.04+ / Fedora 38+ |

Windows is the daily driver. macOS and Linux must work but are not the primary test environment.

### 10.2 Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Application shell | **Tauri v2** | Native window, small binary (~5MB), cross-platform, Rust backend. |
| Frontend | **React + TypeScript** | Mature ecosystem, strong drag-and-drop libraries (dnd-kit), large community. |
| PDF manipulation | **lopdf** or **pdf-rs** (Rust) | Structural page tree operations. No rasterization. |
| Thumbnail rendering | **pdfium-render** (Rust bindings to PDFium) | Rasterization for UI thumbnails only. Never for output. |
| Form filling | **lopdf** or **pdf-rs** | Read/write AcroForm field values in the PDF dictionary. |
| OCR engine | **Tesseract** (via Rust bindings — e.g., `leptess` or `tesseract-rs`) | Library integration only. No CLI shelling. Predictable behavior, testable in CI. |
| Build / bundle | **Tauri bundler** | Produces `.msi` (Windows), `.dmg` (macOS), `.deb`/`.AppImage` (Linux). |

### 10.3 Performance Targets

| Metric | Target |
|---|---|
| App launch to usable | < 3 seconds |
| Open a 50-page PDF | < 2 seconds |
| Thumbnail render (per page) | < 200ms |
| Drag-and-drop reorder | < 16ms frame time (60fps) |
| Export 100-page merged PDF | < 5 seconds |
| Form field detection on open | < 1 second for a 20-field form |
| Print to OS dialog | < 1 second |

### 10.4 Binary Size

Target: **< 35MB** for the installed application including English OCR language data. English is bundled by default — the app is fully functional offline with no post-install downloads.

Future versions may support downloading additional language packs from within the app. Not in scope for v1.

### 10.5 PDF Compliance

- Collate reads PDF 1.0 through 2.0.
- Collate writes PDF 1.7 by default (broadest compatibility with existing readers).
- PDF/A-compliant output is out of scope for v1. Flag for future if legal filing requirements demand it.
- The output pipeline never rasterizes page content. Rotation is a `/Rotate` dictionary entry. Deletion removes pages from the page tree. Merge concatenates page trees. Content streams are passthrough.

### 10.6 File Association

On install, Collate registers as a `.pdf` file handler. On Windows, this means registering in the default apps settings — not silently hijacking the association. The user chooses to make it the default.

### 10.7 Auto-Update

Out of scope for v1. The developer (Tim) manages updates manually. Future candidate: integrate Tauri's built-in updater for silent background updates.

### 10.8 Data Storage

Collate stores minimal local data:

| Data | Location | Purpose |
|---|---|---|
| Window state | OS-standard app config dir | Remember size, position, last view mode |
| Recent files | OS-standard app config dir | File → Open Recent |
| Thumbnail cache | OS-standard temp dir | Avoid re-rendering thumbnails for recently opened files. Keyed by file hash + page number + rotation. Evicted on LRU basis. |
| Bug report drafts | OS-standard app config dir | Preserve unsent bug reports if submission fails |

No user data leaves the machine. No telemetry. No analytics.

---

## 11. Risks & Gotchas

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **XFA form support is incomplete or broken** | High | High | XFA is poorly documented and Adobe-proprietary. Best-effort rendering with degraded capability indicator. Bug reports from real-world forms will drive iterative improvement. |
| **PDFium thumbnail rendering is slow for 500+ page documents** | Medium | High | Lazy rendering — only rasterize thumbnails visible in the viewport. Cache aggressively by file hash + page + rotation. |
| **Drag-and-drop feels laggy in the browser layer** | Medium | Medium | Use a proven library (dnd-kit). Prototype early with a 100+ page grid before committing to the approach. If Tauri's webview introduces latency, investigate native drag events. |
| **lopdf/pdf-rs cannot handle a specific PDF variant** | Medium | Medium | PDF is a sprawling spec. Some producers emit non-conformant files. Catch parse errors gracefully, surface the degraded capability indicator, and file upstream issues. |
| **Tesseract OCR accuracy is poor on low-quality scans** | High | Low | OCR is a convenience feature, not a guarantee. Set user expectations in the UI. Do not promise accuracy. |
| **Form font substitution causes visible layout differences** | Medium | Medium | Use metrically similar fallback fonts. Document the behavior. Accept that pixel-perfect form rendering without the exact embedded font is not always possible. |
| **File association registration conflicts with existing PDF reader** | Low | Low | Register as an available handler, never force-override. Let the user choose in OS settings. |
| **Tauri v2 has breaking changes during development** | Medium | Medium | Pin Tauri version. Do not chase bleeding-edge releases. Upgrade deliberately between phases. |
| **The user doesn't adopt it** | Medium | Critical | Involve her in UI review at every phase. She is the only user that matters. Ship Phase 1 fast and iterate based on her feedback, not assumptions. |

---

## 12. Q&A

**Q: Why not just use Acrobat?**
A: $23/month for features she doesn't need. Collate covers the 90% case — view, print, fill forms, manipulate pages — for free, with no subscription, no account, and no bloat.

**Q: Why not Stirling PDF?**
A: Stirling PDF requires Docker or a JVM. That's infrastructure overhead on a paralegal workstation. Collate is a native executable — double-click and go.

**Q: Why not Sumatra PDF?**
A: Sumatra is an excellent viewer but has no editing capabilities. No form filling, no page manipulation, no annotation. Collate is a viewer *and* an editor.

**Q: Why not LibreOffice Draw?**
A: LibreOffice Draw re-renders PDFs through its own layout engine, which can subtly alter formatting. Unacceptable for legal documents where fidelity matters. Collate operates on the PDF page tree structurally — content passes through untouched.

**Q: Why Tauri and not Electron?**
A: Electron bundles Chromium (~150MB+). Tauri uses the OS webview and ships a ~5MB binary. For an app that opens when you double-click a PDF, startup time and install size matter.

**Q: Why not a pure web app?**
A: No native file dialogs, no file association, no system print integration, no tray/taskbar presence. A browser tab is not a daily-driver tool. Tauri gives us a real desktop app with a web frontend.

**Q: Will this break PDF formatting?**
A: No. Collate never re-renders or rasterizes page content. Rotation is a metadata flag. Deletion and reordering modify the page tree. Content streams are passthrough. What goes in comes out.

**Q: What happens if she opens a PDF that Collate can't fully handle?**
A: Collate opens it anyway and surfaces a persistent degraded capability indicator explaining what's limited and why. She can still work with the document — she just knows something might not behave perfectly.

**Q: Can she break a PDF by using Collate?**
A: No. Source files are never modified unless she explicitly saves over them, and the default save behavior is Save As. Undo is available for all operations within a session.

**Q: How does she report bugs?**
A: Help → Report a Bug. Short form, optional screenshot, one click to submit. It creates a GitHub Issue on the project repo. She never touches GitHub directly.

**Q: How do updates work?**
A: In v1, Tim pushes a new build and installs it manually. Auto-update via Tauri's built-in updater is a future candidate.

---

## 13. Roadmap

### Phase 1 — Viewer (Walking Skeleton)

Ship a functional PDF viewer that could replace her current default.

- [ ] Open a PDF via file picker or file association (double-click from Explorer)
- [ ] Render pages via PDFium (pdfium-render)
- [ ] Continuous scroll and single-page view modes
- [ ] Zoom (fit page, fit width, manual percentage)
- [ ] Page navigation (sidebar thumbnails, PgUp/PgDn, Home/End, j/k/gg/G)
- [ ] Print via OS-native print dialog
- [ ] Tabbed multi-document support
- [ ] Remember window size and position between sessions
- [ ] Recent files list (File → Open Recent)
- [ ] Register as `.pdf` file handler on install
- [ ] Light/dark theme matching OS setting
- [ ] Shortcut reference overlay (`?`)
- [ ] Status bar (page count, zoom level)

**Exit criteria:** She can use Collate as her default PDF viewer for a full workday without reaching for another tool to read or print a document.

### Phase 2 — Form Filling

- [ ] Detect AcroForm fields on document open
- [ ] Render interactive fields (text, checkbox, radio, dropdown)
- [ ] Tab/Shift+Tab navigation between fields
- [ ] Fill and save form data (Save As by default)
- [ ] Flatten forms as an export option
- [ ] XFA best-effort rendering with degraded capability indicator
- [ ] Form-specific undo/redo stack

**Exit criteria:** She can fill her most common state court forms entirely within Collate and produce a correctly filled PDF that prints and emails without issues.

### Phase 3 — Page Manipulation

- [ ] Drag-and-drop page reordering in sidebar and Page Manager view
- [ ] Rotate selected pages (90°/180°/270°)
- [ ] Delete selected pages
- [ ] Merge pages from multiple open documents
- [ ] Source file tracking (color-coded labels on thumbnails)
- [ ] Selection model (click, Ctrl+Click, Shift+Click, Ctrl+A, Escape)
- [ ] Page operation undo/redo stack with save-point markers
- [ ] Right-click context menu on thumbnails
- [ ] Export merged/modified document as new PDF

**Exit criteria:** She can assemble an exhibit packet from 3-5 source PDFs without leaving Collate.

### Phase 4 — Split & Extract

- [ ] Mark split points between pages
- [ ] Export split sections as separate files
- [ ] Select and extract arbitrary pages as a new PDF

**Exit criteria:** She can break a large production document into individually filed exhibits.

### Phase 5 — Freeform Text Annotation

- [ ] Text annotation tool (menu, toolbar, shortcut)
- [ ] Click-to-place text boxes on any page
- [ ] Drag to reposition, drag edges to resize
- [ ] Minimal formatting (font, size, color, bold/italic)
- [ ] Annotations stored as PDF `/FreeText` annotation objects
- [ ] Flatten annotations as an export option

**Exit criteria:** She can add a typed note to a scanned letter and save it as a standard PDF.

### Phase 6 — OCR

- [ ] Detect pages with no text layer
- [ ] Surface degraded capability indicator prompting OCR
- [ ] Run Tesseract (via Rust bindings) on selected pages or entire document
- [ ] Overlay extracted text layer without modifying page content
- [ ] Progress indicator with cancel support
- [ ] Skip pages that already have a text layer
- [ ] English language data bundled with install

**Exit criteria:** She can select and copy text from a scanned document after running OCR.

### Phase 7 — Form Field Creation

- [ ] Add text fields, checkboxes, radio buttons, dropdowns to a page
- [ ] Position and resize fields visually
- [ ] Set field properties (name, default value, required)
- [ ] Save document with embedded form fields that others can fill

**Exit criteria:** She can create a simple fillable form from a flat PDF and send it to a client.

### All Phases — Cross-Cutting

- [ ] Bug reporting (Help → Report a Bug → GitHub Issue)
- [ ] Degraded capability indicator for any document-level limitation
- [ ] Three ways in: menu bar, toolbar, keyboard shortcut for every operation
- [ ] WCAG 2.1 AA compliance
