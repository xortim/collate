# Keyboard Navigation Design (Issue #7)

## Context

Collate's design principle is "mouse and keyboard are equals." Phase 1 milestone 7 requires full Vim-style page navigation (j/k, gg/G) with standard fallbacks (PgUp/PgDn, Home/End), plus a shortcut reference overlay on `?`. The overlay component and `?` binding already exist; no page navigation keys are wired yet.

## Architecture

All keyboard handling lives in a single hook: `src/hooks/useKeyboardNav.ts`. It is called once from `App.tsx` and attaches one `window` keydown listener. This is the single place to look for all keyboard navigation behaviour — no keyboard logic in individual components.

The hook receives two refs:
- `pageViewerRef` — the existing `PageViewerHandle` ref (exposes `scrollToPage`)
- `sidebarRef` — a `RefObject<HTMLElement>` pointing to the sidebar container (new, threaded from `App.tsx` → `PageSidebar`)

## Focus Guards

Two guards, applied per-binding:

- **Global guard** — skip if `event.target` is an `<input>`, `<textarea>`, `<select>`, or has `contentEditable === "true"`. Prevents bindings firing when the user is typing.
- **Sidebar guard** — Shift+↑/↓/j/k only fire when `sidebarRef.current?.contains(document.activeElement)` is true. Prevents selection expansion when the viewer or another element has focus.

## Bindings

| Action | Standard | Vim | Guard |
|--------|----------|-----|-------|
| Next page | PgDn | j | global |
| Previous page | PgUp | k | global |
| First page | Home | gg | global |
| Last page | End | G | global |
| Expand selection down | Shift+↓ | Shift+j | sidebar focused |
| Expand selection up | Shift+↑ | Shift+k | sidebar focused |

Page bounds are clamped: next page stops at `pageCount - 1`, previous stops at `0`.

## `gg` Detection

A `useRef<number>` holds the timestamp of the last `g` keypress. On each `g`, if the previous press was within 500 ms, trigger first-page jump and reset the ref. Otherwise record the timestamp.

## Selection Anchor

Expanding selection with keyboard requires a stable anchor (the page where selection started). Add to the zustand store:

```ts
selectionAnchor: number | null        // index of anchor page, null when no selection
setSelectionAnchor: (i: number | null) => void
```

The anchor is stored in the zustand store (not a local ref) so it survives tab switches. When `clearSelection` is called, `selectionAnchor` is also reset to `null`.

Anchor is set to the clicked page on a **plain click** (no modifier) in `PageSidebar`. On Shift+click (range selection) the anchor is left unchanged — the clicked page becomes the range end, not the new anchor. On Ctrl/Cmd+click (toggle), the anchor is updated to the toggled page only if it is being added (not removed).

Shift+↑/↓/j/k call `selectPageRange(selectionAnchor, newCursor)` using the existing store action.

## ShortcutOverlay Changes

`ShortcutOverlay.tsx` receives two changes:

1. **New "Page Navigation" section** inserted after "File", using the two-column Standard/Vim layout:

   | Action | Standard | Vim |
   |--------|----------|-----|
   | Next page | PgDn | j |
   | Previous page | PgUp | k |
   | First page | Home | gg |
   | Last page | End | G |

2. **"Navigation" section renamed to "Tabs"** to distinguish from page navigation.

3. **Selection section gains two new rows** using the same two-column layout:

   | Action | Standard | Vim |
   |--------|----------|-----|
   | Select All | ⌘A | — |
   | Expand down | Shift+↓ | Shift+j |
   | Expand up | Shift+↑ | Shift+k |

The two-column layout uses fixed-width wrapper divs (`display:flex; justify-content:flex-end`) so column alignment holds without stretching the `<kbd>` chips.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useKeyboardNav.ts` | **new** — all keyboard nav logic |
| `src/App.tsx` | call `useKeyboardNav`, thread `sidebarRef` to `PageSidebar` |
| `src/store.ts` | add `selectionAnchor`, `setSelectionAnchor`; reset anchor in `clearSelection` |
| `src/components/ShortcutOverlay.tsx` | add Page Navigation section, rename Navigation→Tabs, add selection rows |
| `src/components/PageSidebar.tsx` | accept and forward `sidebarRef` prop; call `setSelectionAnchor` on first selection |

## Verification

1. `make test-frontend` — all existing tests pass
2. Open a PDF, click the viewer area, press `j`/`k` — pages advance/retreat
3. Press `PgDn`/`PgUp` — same behaviour
4. Press `gg` (two g's within 500ms) — jumps to page 1
5. Press `G` / `End` — jumps to last page
6. Click a text input (e.g. any future search field), press `j` — no navigation fires
7. Click a sidebar thumbnail to focus sidebar, Shift+↓ — selection expands downward; Shift+↑ contracts/expands upward
8. Switch tabs while sidebar selection is active — anchor survives, expansion continues correctly on return
9. Press `?` — overlay shows Page Navigation section with correct two-column layout
10. Press `Escape` or `?` again — overlay dismisses
