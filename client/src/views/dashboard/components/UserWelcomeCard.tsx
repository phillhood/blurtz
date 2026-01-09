import React from "react";
import { User } from "@types";
import { Card } from "@styles";
import { useUserStats } from "@hooks";

interface UserWelcomeCardProps {
  user: User;
}

const UserWelcomeCard: React.FC<UserWelcomeCardProps> = ({ user }) => {
  const { gamesPlayed, gamesWon, winRate } = useUserStats(user);

  return (
    <Card
      style={{
        height: "100%",
        marginBottom: "20px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          margin: "0 0 10px 0",
          color: "#1f2937",
          fontFamily: "Germania One, sans-serif",
        }}
      >
        Welcome back, {user.username}!
      </h1>
      <div style={{ fontSize: "14px", color: "#6b7280" }}>
        <span>Games Played: {gamesPlayed}</span>
        <span style={{ margin: "0 16px" }}>•</span>
        <span>Games Won: {gamesWon}</span>
        {gamesPlayed > 0 && (
          <>
            <span style={{ margin: "0 16px" }}>•</span>
            <span>Win Rate: {winRate}%</span>
          </>
        )}
      </div>
    </Card>
  );
};

export default UserWelcomeCard;
