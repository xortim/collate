import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toolbar } from "./Toolbar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useAppStore } from "@/store";

// SidebarTrigger inside Toolbar requires the context from SidebarProvider
function renderToolbar(props: { onOpen: () => void; loading: boolean; hasDocument?: boolean }) {
  return render(
    <SidebarProvider>
      <Toolbar {...props} hasDocument={props.hasDocument ?? false} />
    </SidebarProvider>
  );
}

beforeEach(() => {
  useAppStore.setState({ theme: "system" });
});

describe("Toolbar", () => {
  it("renders Open button", () => {
    renderToolbar({ onOpen: vi.fn(), loading: false });
    expect(screen.getByRole("button", { name: /open/i })).toBeInTheDocument();
  });

  it("calls onOpen when Open is clicked", async () => {
    const onOpen = vi.fn();
    renderToolbar({ onOpen, loading: false });
    await userEvent.click(screen.getByRole("button", { name: /open/i }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("disables Open button while loading", () => {
    renderToolbar({ onOpen: vi.fn(), loading: true });
    expect(screen.getByRole("button", { name: /opening/i })).toBeDisabled();
  });

  it("stub buttons (undo, redo, find, print) are disabled", () => {
    renderToolbar({ onOpen: vi.fn(), loading: false });
    expect(screen.getByRole("button", { name: /undo/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /redo/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /find/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /print/i })).toBeDisabled();
  });

  it("zoom buttons are enabled and functional", async () => {
    useAppStore.setState({ zoom: 75, zoomMode: "manual" });
    renderToolbar({ onOpen: vi.fn(), loading: false, hasDocument: true });
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
      renderToolbar({ onOpen: vi.fn(), loading: false, hasDocument: false });
      expect(screen.getByRole("button", { name: /zoom out/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /zoom in/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /fit width/i })).toBeDisabled();
    });

    it("enables zoom controls when a document is open", () => {
      useAppStore.setState({ zoom: 75, zoomMode: "manual" });
      renderToolbar({ onOpen: vi.fn(), loading: false, hasDocument: true });
      expect(screen.getByRole("button", { name: /zoom out/i })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /zoom in/i })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /fit width/i })).not.toBeDisabled();
    });
  });

  it("cycles theme on toggle button click", async () => {
    useAppStore.setState({ theme: "system" });
    renderToolbar({ onOpen: vi.fn(), loading: false });

    const toggle = screen.getByRole("button", { name: /theme/i });
    await userEvent.click(toggle);
    expect(useAppStore.getState().theme).toBe("light");

    await userEvent.click(toggle);
    expect(useAppStore.getState().theme).toBe("dark");

    await userEvent.click(toggle);
    expect(useAppStore.getState().theme).toBe("system");
  });
});
