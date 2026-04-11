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
  security: {
    is_protected: true,
    revision: 3,
    can_print: "high_quality",
    can_modify: false,
    can_copy: true,
    can_annotate: false,
    can_fill_forms: true,
    can_assemble: false,
  },
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
  security: {
    is_protected: false,
    revision: null,
    can_print: "high_quality",
    can_modify: true,
    can_copy: true,
    can_annotate: true,
    can_fill_forms: true,
    can_assemble: true,
  },
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

describe("InfoPanel — Security tab", () => {
  async function openSecurityTab() {
    await userEvent.click(await screen.findByRole("tab", { name: /security/i }));
  }

  it("shows 'Encrypted (Rev. 3)' for a protected doc", async () => {
    renderPanel();
    await openSecurityTab();
    expect(await screen.findByText("Encrypted (Rev. 3)")).toBeInTheDocument();
  });

  it("shows 'None' for an unprotected doc", async () => {
    vi.mocked(invoke).mockResolvedValue(NULL_INFO);
    render(<InfoPanel docId={1} open={true} onOpenChange={vi.fn()} />);
    await openSecurityTab();
    expect(await screen.findByText("None")).toBeInTheDocument();
  });

  it("shows Permissions section only when protected", async () => {
    renderPanel();
    await openSecurityTab();
    expect(await screen.findByText("Permissions")).toBeInTheDocument();
  });

  it("shows Permissions section for unprotected doc", async () => {
    vi.mocked(invoke).mockResolvedValue(NULL_INFO);
    render(<InfoPanel docId={1} open={true} onOpenChange={vi.fn()} />);
    await openSecurityTab();
    expect(await screen.findByText("Permissions")).toBeInTheDocument();
  });

  it("shows 'Allowed' for a permitted action", async () => {
    renderPanel(); // can_copy: true
    await openSecurityTab();
    expect(await screen.findAllByText("Allowed")).not.toHaveLength(0);
  });

  it("shows 'Not allowed' for a denied action", async () => {
    renderPanel(); // can_modify: false
    await openSecurityTab();
    expect(await screen.findAllByText("Not allowed")).not.toHaveLength(0);
  });

  it("shows 'Low quality only' for low-quality print permission", async () => {
    renderPanel({ security: { ...FULL_INFO.security, can_print: "low_quality" } });
    await openSecurityTab();
    expect(await screen.findByText("Low quality only")).toBeInTheDocument();
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
