import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toolbar } from "./Toolbar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useAppStore } from "@/store";

// SidebarTrigger inside Toolbar requires the context from SidebarProvider
function renderToolbar(props: { onOpen: () => void; loading: boolean }) {
  return render(
    <SidebarProvider>
      <Toolbar {...props} />
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

  it("stub buttons (undo, redo, zoom, find, print) are disabled", () => {
    renderToolbar({ onOpen: vi.fn(), loading: false });
    expect(screen.getByRole("button", { name: /undo/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /redo/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /zoom out/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /zoom in/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /fit page/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /find/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /print/i })).toBeDisabled();
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
