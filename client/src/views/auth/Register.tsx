import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuthContext } from "@hooks";
import {
  PageContainer,
  Card,
  Title,
  Form,
  Input,
  Button,
  ErrorMessage,
} from "@styles";

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
    <PageContainer>
      <div style={{ maxWidth: "400px", margin: "0 auto", marginTop: "10vh" }}>
        <Title>Blurtz</Title>
        <Card>
          <h2
            style={{
              textAlign: "center",
              marginBottom: "24px",
              color: "#1f2937",
            }}
          >
            Create Account
          </h2>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          <Form onSubmit={handleSubmit}>
            <Input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </Button>
          </Form>

          <p
            style={{ textAlign: "center", marginTop: "24px", color: "#6b7280" }}
          >
            Already have an account?{" "}
            <Link
              to="/login"
              style={{ color: "#3b82f6", textDecoration: "none" }}
            >
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </PageContainer>
  );
};

export default Register;
