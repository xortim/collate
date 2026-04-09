import { render, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useAppStore } from "@/store";

function renderHandle() {
  const result = render(
    <SidebarProvider defaultOpen={true}>
      <SidebarResizeHandle />
    </SidebarProvider>
  );
  const handle = result.container.querySelector(".cursor-col-resize") as HTMLElement;
  return { ...result, handle };
}

beforeEach(() => {
  useAppStore.setState({ sidebarWidth: 160 });
});

describe("SidebarResizeHandle", () => {
  it("renders a drag handle when sidebar is expanded", () => {
    const { handle } = renderHandle();
    expect(handle).toBeInTheDocument();
  });

  it("drag updates sidebarWidth within min/max bounds", () => {
    const { handle } = renderHandle();

    // Drag right by 60px: 160 + 60 = 220, within [120, 320]
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 260, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(useAppStore.getState().sidebarWidth).toBe(220);
  });

  it("clamps drag to MAX_WIDTH (320)", () => {
    const { handle } = renderHandle();

    // Drag right by 200px: 160 + 200 = 360, clamped to 320
    fireEvent.pointerDown(handle, { button: 0, clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 200, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(useAppStore.getState().sidebarWidth).toBe(320);
  });

  it("clamps drag to MIN_WIDTH (120)", () => {
    const { handle } = renderHandle();

    // Drag left by 60px: 160 - 60 = 100, clamped to 120
    // But 100 > SNAP_CLOSE_THRESHOLD (80), so it clamps rather than snap-closes
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 140, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(useAppStore.getState().sidebarWidth).toBe(120);
  });

  it("snap-closes sidebar and restores pre-drag width when dragged below threshold", () => {
    useAppStore.setState({ sidebarWidth: 160 });
    const { handle } = renderHandle();

    // Drag far left: 160 + (0 - 200) = -40 < SNAP_CLOSE_THRESHOLD (80)
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 0, pointerId: 1 });

    // Pre-drag width is preserved in the store
    expect(useAppStore.getState().sidebarWidth).toBe(160);
    // Handle disappears once sidebar closes (component returns null when state !== "expanded")
    expect(handle).not.toBeInTheDocument();
  });
});
