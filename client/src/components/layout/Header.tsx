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
    <header className="blurtz-appheader">
      <h1 className="blurtz-wordmark" onClick={handleDashboard}>
        Blurtz!
      </h1>

      <div className="blurtz-appheader__actions">
        <span className="blurtz-appheader__user">{user?.username}</span>
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
