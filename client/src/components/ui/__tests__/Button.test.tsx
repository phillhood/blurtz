import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../Button";

describe("Button", () => {
  it("renders children correctly", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("renders as a button element", () => {
    render(<Button>Test</Button>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("handles click events", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByText("Click me"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("renders each variant as a distinct button", () => {
    // Asserting the exact class would pin this to whichever styling layer is
    // underneath - what matters is that six variants stay six distinct looks.
    const classes = (["primary", "secondary", "tertiary", "warning", "danger", "default"] as const).map(
      (variant) => {
        const { unmount } = render(<Button variant={variant}>{variant}</Button>);
        const className = screen.getByRole("button").className;
        unmount();
        return className;
      }
    );

    expect(new Set(classes).size).toBe(6);
  });

  it("can be disabled", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("does not fire onClick when disabled", () => {
    const handleClick = vi.fn();
    render(
      <Button disabled onClick={handleClick}>
        Disabled
      </Button>
    );

    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("accepts additional className", () => {
    render(<Button className="custom-class">Custom</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("custom-class");
  });

  it("forwards the attributes the styling layer accepts", () => {
    render(
      <Button id="go" title="Go now" data-testid="go-button">
        Go
      </Button>
    );

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("id", "go");
    expect(button).toHaveAttribute("title", "Go now");
  });

  it("supports type attribute", () => {
    render(<Button type="submit">Submit</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("type", "submit");
  });

  it("renders an accessible button whatever the styling layer", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });
});
