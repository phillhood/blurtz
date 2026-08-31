import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "../Login";

vi.mock("@hooks", () => ({ useAuthContext: () => ({ login: vi.fn() }) }));

describe("Login", () => {
  it("labels its fields rather than relying on placeholders", () => {
    render(<MemoryRouter><Login /></MemoryRouter>);

    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("says what the game is for someone who has never seen it", () => {
    render(<MemoryRouter><Login /></MemoryRouter>);

    expect(screen.getByText("Nertz, in real time")).toBeInTheDocument();
  });

  it("carries no display type outside the app's own", () => {
    const { container } = render(<MemoryRouter><Login /></MemoryRouter>);

    expect(container.querySelector(".germania-font")).toBeNull();
  });
});
