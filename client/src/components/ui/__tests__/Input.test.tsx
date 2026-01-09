import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "../Input";

describe("Input", () => {
  it("renders as an input element", () => {
    render(<Input data-testid="input" />);
    expect(screen.getByTestId("input")).toBeInTheDocument();
    expect(screen.getByTestId("input").tagName).toBe("INPUT");
  });

  it("accepts and displays value", () => {
    render(<Input value="test value" onChange={() => {}} />);
    expect(screen.getByDisplayValue("test value")).toBeInTheDocument();
  });

  it("handles change events", async () => {
    const handleChange = vi.fn();
    render(<Input onChange={handleChange} />);

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "hello");

    expect(handleChange).toHaveBeenCalled();
  });

  it("supports placeholder text", () => {
    render(<Input placeholder="Enter your name" />);
    expect(screen.getByPlaceholderText("Enter your name")).toBeInTheDocument();
  });

  it("supports different input types", () => {
    render(<Input type="email" data-testid="email-input" />);
    const input = screen.getByTestId("email-input");
    expect(input).toHaveAttribute("type", "email");
  });

  it("supports password type", () => {
    render(<Input type="password" data-testid="password-input" />);
    const input = screen.getByTestId("password-input");
    expect(input).toHaveAttribute("type", "password");
  });

  it("can be disabled", () => {
    render(<Input disabled data-testid="disabled-input" />);
    expect(screen.getByTestId("disabled-input")).toBeDisabled();
  });

  it("can be required", () => {
    render(<Input required data-testid="required-input" />);
    expect(screen.getByTestId("required-input")).toBeRequired();
  });

  it("applies custom className", () => {
    render(<Input className="custom-class" data-testid="custom-input" />);
    expect(screen.getByTestId("custom-input")).toHaveClass("custom-class");
  });

  it("has correct base styles", () => {
    render(<Input data-testid="styled-input" />);
    const input = screen.getByTestId("styled-input");
    expect(input).toHaveClass("w-full");
    expect(input).toHaveClass("p-3");
    expect(input).toHaveClass("border");
    expect(input).toHaveClass("rounded-md");
  });

  it("forwards additional props", () => {
    render(<Input data-testid="props-input" maxLength={50} minLength={5} />);
    const input = screen.getByTestId("props-input");
    expect(input).toHaveAttribute("maxLength", "50");
    expect(input).toHaveAttribute("minLength", "5");
  });

  it("handles focus events", () => {
    const handleFocus = vi.fn();
    render(<Input onFocus={handleFocus} data-testid="focus-input" />);

    fireEvent.focus(screen.getByTestId("focus-input"));
    expect(handleFocus).toHaveBeenCalledTimes(1);
  });

  it("handles blur events", () => {
    const handleBlur = vi.fn();
    render(<Input onBlur={handleBlur} data-testid="blur-input" />);

    fireEvent.blur(screen.getByTestId("blur-input"));
    expect(handleBlur).toHaveBeenCalledTimes(1);
  });

  it("supports autoComplete attribute", () => {
    render(<Input autoComplete="email" data-testid="autocomplete-input" />);
    expect(screen.getByTestId("autocomplete-input")).toHaveAttribute(
      "autoComplete",
      "email"
    );
  });

  it("supports name attribute", () => {
    render(<Input name="username" data-testid="named-input" />);
    expect(screen.getByTestId("named-input")).toHaveAttribute(
      "name",
      "username"
    );
  });
});
