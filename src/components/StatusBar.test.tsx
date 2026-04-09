import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { StatusBar } from "./StatusBar";
import { useAppStore } from "@/store";

// Reset store between tests so state doesn't leak
beforeEach(() => {
  useAppStore.setState({ activePage: 0, zoom: 100 });
});

describe("StatusBar", () => {
  it("renders an empty footer when no document is open", () => {
    const { container } = render(<StatusBar pageCount={undefined} />);
    expect(container.querySelector("footer")).toBeInTheDocument();
    expect(screen.queryByText(/Page/)).not.toBeInTheDocument();
  });

  it("shows page 1 of N when activePage is 0", () => {
    render(<StatusBar pageCount={5} />);
    expect(screen.getByText("Page 1 of 5")).toBeInTheDocument();
  });

  it("shows current page when activePage changes", () => {
    useAppStore.setState({ activePage: 2 });
    render(<StatusBar pageCount={10} />);
    expect(screen.getByText("Page 3 of 10")).toBeInTheDocument();
  });

  it("shows zoom level", () => {
    useAppStore.setState({ zoom: 150 });
    render(<StatusBar pageCount={1} />);
    expect(screen.getByText("150%")).toBeInTheDocument();
  });

  it("shows dirty indicator when isDirty is true", () => {
    useAppStore.setState({ isDirty: true });
    render(<StatusBar pageCount={5} />);
    expect(screen.getByText("•")).toBeInTheDocument();
  });

  it("hides dirty indicator when isDirty is false", () => {
    useAppStore.setState({ isDirty: false });
    render(<StatusBar pageCount={5} />);
    expect(screen.queryByText("•")).not.toBeInTheDocument();
  });
});
