import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppButton } from "@shychedelic/voidglass-react";

describe("voidglass", () => {
  it("renders a library component", () => {
    render(<AppButton>Deal</AppButton>);
    expect(screen.getByRole("button", { name: "Deal" })).toBeInTheDocument();
  });
});
