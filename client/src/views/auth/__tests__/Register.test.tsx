import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockRegister = vi.fn();

vi.mock("@hooks", () => ({
  useAuthContext: () => ({ register: mockRegister }),
}));

const Register = (await import("../Register")).default;

/**
 * The registration form's own validation - the rules it enforces before it is
 * willing to spend a request. `/api/auth/register` allows 5 a minute per IP,
 * so a form that posts a mismatched password is a form that burns a fifth of
 * the user's budget to be told something it already knew.
 */
const setup = () => {
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );
  return {
    user: userEvent.setup(),
    username: screen.getByPlaceholderText("Username"),
    password: screen.getByPlaceholderText("Password"),
    confirm: screen.getByPlaceholderText("Confirm Password"),
    submit: screen.getByRole("button", { name: "Create Account" }),
  };
};

describe("Register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegister.mockResolvedValue(undefined);
  });

  it("registers with what the user typed", async () => {
    const { user, username, password, confirm, submit } = setup();

    await user.type(username, "newbie");
    await user.type(password, "password123");
    await user.type(confirm, "password123");
    await user.click(submit);

    expect(mockRegister).toHaveBeenCalledWith("newbie", "password123");
  });

  it("refuses a mismatched confirmation without asking the server", async () => {
    const { user, username, password, confirm, submit } = setup();

    await user.type(username, "newbie");
    await user.type(password, "password123");
    await user.type(confirm, "password124");
    await user.click(submit);

    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    // The server cannot catch this one - it never sees the confirmation field.
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("refuses a password under 6 characters", async () => {
    const { user, username, password, confirm, submit } = setup();

    await user.type(username, "newbie");
    await user.type(password, "short");
    await user.type(confirm, "short");
    await user.click(submit);

    expect(
      screen.getByText("Password must be at least 6 characters long")
    ).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("refuses a username under 3 characters", async () => {
    const { user, username, password, confirm, submit } = setup();

    await user.type(username, "ab");
    await user.type(password, "password123");
    await user.type(confirm, "password123");
    await user.click(submit);

    expect(
      screen.getByText("Username must be at least 3 characters long")
    ).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("checks the confirmation before it checks the password's length", async () => {
    // Order matters for what the user is told first. Both are wrong here;
    // "do not match" is the one they can see for themselves.
    const { user, username, password, confirm, submit } = setup();

    await user.type(username, "newbie");
    await user.type(password, "abc");
    await user.type(confirm, "xyz");
    await user.click(submit);

    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(
      screen.queryByText("Password must be at least 6 characters long")
    ).not.toBeInTheDocument();
  });

  it("shows the server's reason when registration is refused", async () => {
    mockRegister.mockRejectedValue(new Error("User already exists"));
    const { user, username, password, confirm, submit } = setup();

    await user.type(username, "taken");
    await user.type(password, "password123");
    await user.type(confirm, "password123");
    await user.click(submit);

    expect(await screen.findByText("User already exists")).toBeInTheDocument();
  });

  it("keeps what the user typed when registration is refused", async () => {
    // Same failure mode the login form had: a form that empties itself on
    // rejection makes the user retype everything to change one field.
    mockRegister.mockRejectedValue(new Error("User already exists"));
    const { user, username, password, confirm, submit } = setup();

    await user.type(username, "taken");
    await user.type(password, "password123");
    await user.type(confirm, "password123");
    await user.click(submit);

    await screen.findByText("User already exists");
    expect(screen.getByPlaceholderText("Username")).toHaveValue("taken");
    expect(screen.getByPlaceholderText("Password")).toHaveValue("password123");
  });

  it("re-enables the form after a refusal so the user can try again", async () => {
    mockRegister.mockRejectedValue(new Error("User already exists"));
    const { user, username, password, confirm, submit } = setup();

    await user.type(username, "taken");
    await user.type(password, "password123");
    await user.type(confirm, "password123");
    await user.click(submit);

    await screen.findByText("User already exists");
    // The `finally` that clears `loading`. Without it the button stays
    // disabled and the user is stuck on a form they can never resubmit.
    expect(screen.getByRole("button", { name: "Create Account" })).toBeEnabled();
  });

  it("disables the submit while the request is in flight", async () => {
    let settle: () => void = () => {};
    mockRegister.mockImplementation(() => new Promise<void>((r) => (settle = r)));
    const { user, username, password, confirm, submit } = setup();

    await user.type(username, "newbie");
    await user.type(password, "password123");
    await user.type(confirm, "password123");
    await user.click(submit);

    // Double-submitting a registration is two accounts, or one account and a
    // 409 blaming the user for the form's own bug.
    expect(
      await screen.findByRole("button", { name: "Creating account..." })
    ).toBeDisabled();

    settle();
  });

  it("clears the previous error when the form is resubmitted", async () => {
    mockRegister.mockRejectedValueOnce(new Error("User already exists"));
    const { user, username, password, confirm, submit } = setup();

    await user.type(username, "taken");
    await user.type(password, "password123");
    await user.type(confirm, "password123");
    await user.click(submit);
    await screen.findByText("User already exists");

    await user.clear(username);
    await user.type(username, "fresh");
    await user.click(submit);

    // A stale "User already exists" above a successful registration would be
    // a lie the user has no way to dismiss.
    expect(screen.queryByText("User already exists")).not.toBeInTheDocument();
    expect(mockRegister).toHaveBeenLastCalledWith("fresh", "password123");
  });

  it("links to the login form", () => {
    setup();

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login"
    );
  });
});
