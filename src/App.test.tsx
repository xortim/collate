import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import App from "./App";
import { useAppStore } from "@/store";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn().mockResolvedValue(null) }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn().mockResolvedValue("0.0.0") }));
vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();
  return { ...actual, toast: { ...actual.toast, error: vi.fn() } };
});

const MOCK_MANIFEST = {
  doc_id: 1,
  page_count: 3,
  filename: "test.pdf",
  page_sizes: [
    { width_pts: 612, height_pts: 792 },
    { width_pts: 612, height_pts: 792 },
    { width_pts: 612, height_pts: 792 },
  ],
};

beforeEach(() => {
  useAppStore.setState({ theme: "system", zoom: 75, zoomMode: "manual", activePage: 0 });
  (invoke as Mock).mockResolvedValue(undefined);
  (openDialog as Mock).mockResolvedValue(null);
});

describe("App", () => {
  it("shows empty state on mount", () => {
    render(<App />);
    expect(screen.getByText(/no document open/i)).toBeInTheDocument();
  });

  it("zoom controls are disabled when no document is open", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /zoom in/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /zoom out/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /fit width/i })).toBeDisabled();
  });

  it("shows status bar and hides empty state after document opens", async () => {
    (openDialog as Mock).mockResolvedValue("/path/to/test.pdf");
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "open_document") return Promise.resolve(MOCK_MANIFEST);
      return Promise.resolve(undefined);
    });

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /^open$/i }));

    await waitFor(() => {
      expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/no document open/i)).not.toBeInTheDocument();
  });

  it("enables zoom controls after document opens", async () => {
    (openDialog as Mock).mockResolvedValue("/path/to/test.pdf");
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "open_document") return Promise.resolve(MOCK_MANIFEST);
      return Promise.resolve(undefined);
    });

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /^open$/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /zoom in/i })).not.toBeDisabled();
    });
    expect(screen.getByRole("button", { name: /zoom out/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /fit width/i })).not.toBeDisabled();
  });

  it("shows error toast when open_document fails", async () => {
    (openDialog as Mock).mockResolvedValue("/path/to/bad.pdf");
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "open_document") return Promise.reject("corrupt PDF");
      return Promise.resolve(undefined);
    });

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /^open$/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/corrupt pdf/i),
        expect.objectContaining({ id: "pdf-error" })
      );
    });
  });

  it("Mod+= fires zoom-in step", () => {
    useAppStore.setState({ zoom: 75, zoomMode: "manual" });
    render(<App />);

    fireEvent.keyDown(window, { key: "=", metaKey: true });

    expect(useAppStore.getState().zoom).toBe(100);
    expect(useAppStore.getState().zoomMode).toBe("manual");
  });

  it("Ctrl+= fires zoom-in step on non-mac", () => {
    useAppStore.setState({ zoom: 75, zoomMode: "manual" });
    render(<App />);

    fireEvent.keyDown(window, { key: "=", ctrlKey: true });

    expect(useAppStore.getState().zoom).toBe(100);
  });
});
