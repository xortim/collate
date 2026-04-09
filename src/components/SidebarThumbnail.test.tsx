import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SidebarThumbnail } from "./SidebarThumbnail";
import { useAppStore } from "@/store";

// jsdom doesn't implement collate:// image loading — stub Image so the
// useEffect that loads the thumbnail src doesn't error or stall.
class FakeImage {
  onload: (() => void) | null = null;
  set src(_: string) {
    // Immediately resolve so displayedSrc is set and skeleton is replaced.
    this.onload?.();
  }
}
vi.stubGlobal("Image", FakeImage);

// Mock Tauri invoke so stub commands don't throw in jsdom.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockRejectedValue("rotate_pages: not yet implemented"),
}));

// Mock Sonner toast so we can assert on it.
vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

function renderThumbnail(overrides: Partial<Parameters<typeof SidebarThumbnail>[0]> = {}) {
  return render(
    <SidebarThumbnail
      docId={1}
      pageIndex={0}
      width={120}
      widthPts={612}
      heightPts={792}
      isActive={false}
      isSelected={false}
      onClick={vi.fn()}
      {...overrides}
    />
  );
}

beforeEach(() => {
  useAppStore.setState({ selectedPages: new Set() });
});

describe("SidebarThumbnail — ring / selection indicator", () => {
  it("shows no ring when not active and not selected", () => {
    const { container } = renderThumbnail({ isActive: false, isSelected: false });
    const btn = container.querySelector("button")!;
    // focus-visible:ring-* classes are always present; only the non-prefixed
    // ring-N ring-color classes indicate a visible ring state.
    expect(btn.className).not.toMatch(/(?<![:-])ring-[24]/);
  });

  it("shows active ring (ring-2 ring-primary) when active but not selected", () => {
    const { container } = renderThumbnail({ isActive: true, isSelected: false });
    const btn = container.querySelector("button")!;
    expect(btn.className).toMatch(/ring-2/);
    expect(btn.className).toMatch(/ring-primary/);
    expect(btn.className).not.toMatch(/ring-4/);
  });

  it("shows selection ring (ring-4 ring-blue-500) when selected", () => {
    const { container } = renderThumbnail({ isActive: false, isSelected: true });
    const btn = container.querySelector("button")!;
    expect(btn.className).toMatch(/ring-4/);
    expect(btn.className).toMatch(/ring-blue-500/);
  });

  it("selection ring takes precedence over active ring when both are true", () => {
    const { container } = renderThumbnail({ isActive: true, isSelected: true });
    const btn = container.querySelector("button")!;
    expect(btn.className).toMatch(/ring-4/);
    expect(btn.className).toMatch(/ring-blue-500/);
    expect(btn.className).not.toMatch(/ring-primary/);
  });
});

describe("SidebarThumbnail context menu", () => {
  it("renders a right-click context menu trigger", async () => {
    renderThumbnail();
    const thumb = screen.getByRole("button", { name: /go to page 1/i });
    await userEvent.pointer({ target: thumb, keys: "[MouseRight]" });
    expect(screen.getByRole("menuitem", { name: /rotate clockwise/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /rotate counter-clockwise/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /delete page/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /insert page before/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /insert page after/i })).toBeInTheDocument();
  });

  it("Rotate and Delete items are enabled; Insert items remain disabled", async () => {
    renderThumbnail();
    const thumb = screen.getByRole("button", { name: /go to page 1/i });
    await userEvent.pointer({ target: thumb, keys: "[MouseRight]" });

    expect(screen.getByRole("menuitem", { name: /rotate clockwise/i })).not.toHaveAttribute("data-disabled");
    expect(screen.getByRole("menuitem", { name: /rotate counter-clockwise/i })).not.toHaveAttribute("data-disabled");
    expect(screen.getByRole("menuitem", { name: /delete page/i })).not.toHaveAttribute("data-disabled");
    expect(screen.getByRole("menuitem", { name: /insert page before/i })).toHaveAttribute("data-disabled");
    expect(screen.getByRole("menuitem", { name: /insert page after/i })).toHaveAttribute("data-disabled");
  });

  it("clicking context menu item does not trigger navigation", async () => {
    const onClick = vi.fn();
    renderThumbnail({ onClick });
    const thumb = screen.getByRole("button", { name: /go to page 1/i });
    await userEvent.pointer({ target: thumb, keys: "[MouseRight]" });
    const rotateItem = screen.getByRole("menuitem", { name: /rotate clockwise/i });
    await userEvent.click(rotateItem);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("clicking Rotate CW invokes rotate_pages and toasts on stub error", async () => {
    const { toast } = await import("sonner");
    const { invoke } = await import("@tauri-apps/api/core");
    renderThumbnail({ pageIndex: 2 });
    const thumb = screen.getByRole("button", { name: /go to page 3/i });
    await userEvent.pointer({ target: thumb, keys: "[MouseRight]" });
    await userEvent.click(screen.getByRole("menuitem", { name: /rotate clockwise/i }));
    expect(invoke).toHaveBeenCalledWith("rotate_pages", {
      docId: 1,
      pageIndices: [2],
      degrees: 90,
    });
    // invoke rejects → toast.error should have been called
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
