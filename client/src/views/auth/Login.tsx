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
    <PageContainer>
      <div style={{ maxWidth: "400px", margin: "0 auto", marginTop: "10vh" }}>
        <Title className="germania-font">Blurtz!</Title>
        <Card>
          <h2
            style={{
              textAlign: "center",
              marginBottom: "24px",
              color: "#1f2937",
            }}
          >
            Welcome Back
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
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </Form>

          <p
            style={{ textAlign: "center", marginTop: "24px", color: "#6b7280" }}
          >
            Don't have an account?{" "}
            <Link
              to="/register"
              style={{ color: "#3b82f6", textDecoration: "none" }}
            >
              Sign up
            </Link>
          </p>
        </Card>
      </div>
    </PageContainer>
  );
};

export default Login;
