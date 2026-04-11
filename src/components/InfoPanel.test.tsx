import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { InfoPanel } from "./InfoPanel";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const FULL_INFO = {
  title: "My Contract",
  author: "Jane Smith",
  subject: "Legal",
  keywords: "contract, legal, 2023",
  creator: "Word",
  producer: "Adobe PDF",
  creation_date: "D:20230415143022",
  modification_date: null,
  page_count: 12,
  file_size_bytes: 393216,
  pdf_version: "PDF 1.7",
};

const NULL_INFO = {
  title: null,
  author: null,
  subject: null,
  keywords: null,
  creator: null,
  producer: null,
  creation_date: null,
  modification_date: null,
  page_count: 5,
  file_size_bytes: null,
  pdf_version: null,
};

function renderPanel(overrides: Partial<typeof FULL_INFO> = {}, open = true) {
  vi.mocked(invoke).mockResolvedValue({ ...FULL_INFO, ...overrides });
  return render(<InfoPanel docId={1} open={open} onOpenChange={vi.fn()} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InfoPanel — loading state", () => {
  it("renders skeleton elements while invoke is pending", () => {
    vi.mocked(invoke).mockReturnValue(new Promise(() => {})); // never resolves
    render(<InfoPanel docId={1} open={true} onOpenChange={vi.fn()} />);
    expect(document.querySelectorAll("[data-slot=skeleton]").length).toBeGreaterThan(0);
  });

  it("does not call invoke when open is false", () => {
    vi.mocked(invoke).mockResolvedValue(FULL_INFO);
    render(<InfoPanel docId={1} open={false} onOpenChange={vi.fn()} />);
    expect(vi.mocked(invoke)).not.toHaveBeenCalled();
  });
});

describe("InfoPanel — Info tab", () => {
  it("shows page count", async () => {
    renderPanel();
    expect(await screen.findByText("12")).toBeInTheDocument();
  });

  it("shows formatted file size", async () => {
    renderPanel();
    expect(await screen.findByText("384.0 KB")).toBeInTheDocument();
  });

  it("shows pdf version", async () => {
    renderPanel();
    expect(await screen.findByText("PDF 1.7")).toBeInTheDocument();
  });

  it("shows 'Not set' for null title", async () => {
    vi.mocked(invoke).mockResolvedValue(NULL_INFO);
    render(<InfoPanel docId={1} open={true} onOpenChange={vi.fn()} />);
    const notSetLabels = await screen.findAllByText("Not set");
    expect(notSetLabels.length).toBeGreaterThan(0);
  });

  it("shows formatted date for valid creation_date", async () => {
    renderPanel();
    // parsePdfDate extracts the year at minimum
    const el = await screen.findByText(/2023/);
    expect(el).toBeInTheDocument();
  });

  it("shows 'Not set' for null creation_date", async () => {
    vi.mocked(invoke).mockResolvedValue(NULL_INFO);
    render(<InfoPanel docId={1} open={true} onOpenChange={vi.fn()} />);
    const notSetLabels = await screen.findAllByText("Not set");
    expect(notSetLabels.length).toBeGreaterThan(0);
  });
});

describe("InfoPanel — Keywords tab", () => {
  it("shows keyword badges for comma-separated keywords", async () => {
    renderPanel({ keywords: "contract, legal, 2023" });
    await userEvent.click(await screen.findByRole("tab", { name: /keywords/i }));
    expect(await screen.findByText("contract")).toBeInTheDocument();
    expect(await screen.findByText("legal")).toBeInTheDocument();
    expect(await screen.findByText("2023")).toBeInTheDocument();
  });

  it("shows 'No keywords defined.' when keywords is null", async () => {
    vi.mocked(invoke).mockResolvedValue(NULL_INFO);
    render(<InfoPanel docId={1} open={true} onOpenChange={vi.fn()} />);
    await userEvent.click(await screen.findByRole("tab", { name: /keywords/i }));
    expect(await screen.findByText(/no keywords defined/i)).toBeInTheDocument();
  });
});

describe("InfoPanel — error state", () => {
  it("renders the sheet header even if invoke rejects", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("not found"));
    render(<InfoPanel docId={1} open={true} onOpenChange={vi.fn()} />);
    expect(await screen.findByText(/document info/i)).toBeInTheDocument();
  });

  it("shows error message in Info tab when invoke rejects", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("not found"));
    render(<InfoPanel docId={1} open={true} onOpenChange={vi.fn()} />);
    expect(await screen.findByText(/could not load document info/i)).toBeInTheDocument();
  });
});
