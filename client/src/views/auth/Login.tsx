import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuthContext } from "@hooks";
import { Form, Input, Button, ErrorMessage } from "@styles";
import AuthLayout from "./AuthLayout";

const Login: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuthContext();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to pick up your table.">
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
            autoComplete="current-password"
            required
          />
        </div>

        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </Button>
      </Form>

      <p className="blurtz-auth__foot">
        Don't have an account? <Link to="/register">Sign up</Link>
      </p>
    </AuthLayout>
  );
};

export default Login;
