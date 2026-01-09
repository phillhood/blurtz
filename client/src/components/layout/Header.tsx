import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuthContext, useGameContext } from "@hooks";
import { Button } from "@styles";

const Header: React.FC = () => {
  const { user, logout } = useAuthContext();
  const { leaveGame } = useGameContext();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    leaveGame();
    logout();
    navigate("/login");
  };

  const handleDashboard = () => {
    leaveGame();
    navigate("/dashboard");
  };

  const isDashboard = location.pathname === "/dashboard";

  return (
    <header
      style={{
        background: "rgb(35, 59, 99)",
        padding: "15px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        height: "80px",
        // borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
        <h1
          style={{
            margin: 0,
            fontSize: "1.5rem",
            fontFamily: "Germania One, sans-serif",
            background: "white",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            cursor: "pointer",
          }}
          onClick={handleDashboard}
        >
          Blurtz!
        </h1>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
        <span style={{ color: "#e5e7eb", marginRight: "20px" }}>
          {user?.username}
        </span>
        {!isDashboard && (
          <Button
            variant="tertiary"
            onClick={handleDashboard}
            title="Go to Dashboard"
          >
            Dashboard
          </Button>
        )}
        <Button variant="default" onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </header>
  );
};

export default Header;
