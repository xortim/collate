# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Collate is a cross-platform PDF editing suite built with Tauri v2 (Rust backend) + React + TypeScript (frontend). See docs/SPEC.md for product requirements and docs/ARCHITECTURE.md for technical design.

## Tech Stack

- Application shell: Tauri v2
- Backend: Rust (lopdf for PDF manipulation, pdfium-render for page rasterization)
- Frontend: React + TypeScript, Vite, shadcn/ui (Radix), Tailwind CSS
- State management: zustand (UI state only — Rust owns document state)
- Drag-and-drop: @dnd-kit/core + @dnd-kit/sortable
- Virtual scrolling: @tanstack/react-virtual
- Package manager: pnpm

## Development Commands

- `cargo tauri dev` — run the app in development mode
- `cargo tauri build` — production build
- `cargo test` — run Rust tests (from src-tauri/)
- `pnpm test` — run frontend tests

## Architecture Rules

- Rust owns all PDF data. The frontend never receives raw PDF bytes.
- Frontend is a view layer. It renders state from the backend and sends commands via Tauri IPC.
- IPC is the contract. If it's not in the IPC contract, it doesn't exist.
- Never rasterize page content for output. Rasterization is for UI thumbnails only.
- No shelling out. All functionality via linked libraries.
- Every mutation command returns the full WorkspaceManifest.

## Code Style

- Conventional commits: feat, fix, docs, chore, refactor, test, ci, build, perf, style
- Rust: standard rustfmt, clippy clean
- TypeScript: strict mode

## Current Phase

Phase 1 — PDF Viewer (walking skeleton). See docs/ARCHITECTURE.md Section 11.2 for milestones.

## Developer Context

Tim is learning Rust through this project. He knows Go, bash, and unix tooling well. When writing Rust code, explain Rust-specific concepts as they come up — ownership, borrows, traits, Result/Option patterns, derive macros, etc. Enough to troubleshoot and steer, not drive. Draw parallels to Go where helpful.

## Key Design Principles (from spec)

- Non-destructive by default. Source files are never modified until explicit save.
- Mouse and keyboard are equals. Vim keybindings (hjkl, gg, G) with standard fallbacks.
- Simple by default. Plain English labels. Shallow menus. If it needs explanation, it's too complicated.
- Three ways in. Every operation accessible via menu bar, toolbar, and keyboard shortcut.
- Degraded mode is visible. Persistent indicator when a document's features aren't fully supported.
