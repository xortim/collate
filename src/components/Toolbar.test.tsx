import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toolbar } from "./Toolbar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useAppStore } from "@/store";

// SidebarTrigger inside Toolbar requires the context from SidebarProvider
function renderToolbar(props: {
  onOpen?: () => void;
  loading?: boolean;
  hasDocument?: boolean;
  isDirty?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}) {
  return render(
    <SidebarProvider>
      <Toolbar
        onOpen={props.onOpen ?? vi.fn()}
        loading={props.loading ?? false}
        hasDocument={props.hasDocument ?? false}
        isDirty={props.isDirty ?? false}
        canUndo={props.canUndo ?? false}
        canRedo={props.canRedo ?? false}
        onSave={props.onSave ?? vi.fn()}
        onUndo={props.onUndo ?? vi.fn()}
        onRedo={props.onRedo ?? vi.fn()}
      />
    </SidebarProvider>
  );
}

beforeEach(() => {
  useAppStore.setState({ theme: "system" });
});

describe("Toolbar", () => {
  it("renders Open button", () => {
    renderToolbar({});
    expect(screen.getByRole("button", { name: /open/i })).toBeInTheDocument();
  });

  it("calls onOpen when Open is clicked", async () => {
    const onOpen = vi.fn();
    renderToolbar({ onOpen });
    await userEvent.click(screen.getByRole("button", { name: /open/i }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("disables Open button while loading", () => {
    renderToolbar({ loading: true });
    expect(screen.getByRole("button", { name: /opening/i })).toBeDisabled();
  });

  it("stub buttons (find, print) are disabled", () => {
    renderToolbar({});
    expect(screen.getByRole("button", { name: /find/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /print/i })).toBeDisabled();
  });

  describe("Save button", () => {
    it("is disabled when no document is open", () => {
      renderToolbar({ hasDocument: false });
      expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    });

    it("is enabled when a document is open and dirty", () => {
      renderToolbar({ hasDocument: true, isDirty: true });
      expect(screen.getByRole("button", { name: /save/i })).not.toBeDisabled();
    });

    it("is disabled when document is open but not dirty", () => {
      renderToolbar({ hasDocument: true, isDirty: false });
      expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    });

    it("calls onSave when clicked", async () => {
      const onSave = vi.fn();
      renderToolbar({ hasDocument: true, isDirty: true, onSave });
      await userEvent.click(screen.getByRole("button", { name: /save/i }));
      expect(onSave).toHaveBeenCalledOnce();
    });
  });

  describe("Undo / Redo buttons", () => {
    it("undo is disabled when canUndo is false", () => {
      renderToolbar({ canUndo: false });
      expect(screen.getByRole("button", { name: /undo/i })).toBeDisabled();
    });

    it("undo is enabled when canUndo is true", () => {
      renderToolbar({ canUndo: true });
      expect(screen.getByRole("button", { name: /undo/i })).not.toBeDisabled();
    });

    it("calls onUndo when undo is clicked", async () => {
      const onUndo = vi.fn();
      renderToolbar({ canUndo: true, onUndo });
      await userEvent.click(screen.getByRole("button", { name: /undo/i }));
      expect(onUndo).toHaveBeenCalledOnce();
    });

    it("redo is disabled when canRedo is false", () => {
      renderToolbar({ canRedo: false });
      expect(screen.getByRole("button", { name: /redo/i })).toBeDisabled();
    });

    it("redo is enabled when canRedo is true", () => {
      renderToolbar({ canRedo: true });
      expect(screen.getByRole("button", { name: /redo/i })).not.toBeDisabled();
    });

    it("calls onRedo when redo is clicked", async () => {
      const onRedo = vi.fn();
      renderToolbar({ canRedo: true, onRedo });
      await userEvent.click(screen.getByRole("button", { name: /redo/i }));
      expect(onRedo).toHaveBeenCalledOnce();
    });
  });

  it("zoom buttons are enabled and functional", async () => {
    useAppStore.setState({ zoom: 75, zoomMode: "manual" });
    renderToolbar({ hasDocument: true });
    expect(screen.getByRole("button", { name: /zoom out/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /zoom in/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /fit width/i })).not.toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /zoom in/i }));
    expect(useAppStore.getState().zoom).toBe(100);
    expect(useAppStore.getState().zoomMode).toBe("manual");

    await userEvent.click(screen.getByRole("button", { name: /fit width/i }));
    expect(useAppStore.getState().zoomMode).toBe("fit-width");
  });

  describe("document-dependent disabled state", () => {
    it("disables zoom controls when no document is open", () => {
      useAppStore.setState({ zoom: 75, zoomMode: "manual" });
      renderToolbar({ hasDocument: false });
      expect(screen.getByRole("button", { name: /zoom out/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /zoom in/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /fit width/i })).toBeDisabled();
    });

    it("enables zoom controls when a document is open", () => {
      useAppStore.setState({ zoom: 75, zoomMode: "manual" });
      renderToolbar({ hasDocument: true });
      expect(screen.getByRole("button", { name: /zoom out/i })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /zoom in/i })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /fit width/i })).not.toBeDisabled();
    });
  });

  it("cycles theme on toggle button click", async () => {
    useAppStore.setState({ theme: "system" });
    renderToolbar({});

    const toggle = screen.getByRole("button", { name: /theme/i });
    await userEvent.click(toggle);
    expect(useAppStore.getState().theme).toBe("light");

    await userEvent.click(toggle);
    expect(useAppStore.getState().theme).toBe("dark");

    await userEvent.click(toggle);
    expect(useAppStore.getState().theme).toBe("system");
  });
});
