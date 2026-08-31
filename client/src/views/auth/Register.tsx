import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuthContext } from "@hooks";
import { Form, Input, Button, ErrorMessage } from "@styles";
import AuthLayout from "./AuthLayout";

const Register: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuthContext();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long");
      return;
    }

    if (username.length < 3) {
      setError("Username must be at least 3 characters long");
      return;
    }

    setLoading(true);

    try {
      await register(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create account" subtitle="Pick a name and you are in.">
      {error && <ErrorMessage>{error}</ErrorMessage>}

      <Form onSubmit={handleSubmit}>
        <div className="blurtz-field">
          <label className="blurtz-field__label" htmlFor="username">
            Username
          </label>
          <Input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div className="blurtz-field">
          <label className="blurtz-field__label" htmlFor="password">
            Password
          </label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        <div className="blurtz-field">
          <label className="blurtz-field__label" htmlFor="confirmPassword">
            Confirm Password
          </label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? "Creating account..." : "Create Account"}
        </Button>
      </Form>

      <p className="blurtz-auth__foot">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
};

export default Register;
