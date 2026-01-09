import React from "react";
import { Card, Button, ErrorMessage, SuccessMessage } from "@styles";
import { Notification } from "@hooks";

interface QuickActionsCardProps {
  onCreateGame: () => void;
  onRefreshGames: () => void;
  notification: Notification | null;
  loading?: boolean;
}

const QuickActionsCard: React.FC<QuickActionsCardProps> = ({
  onCreateGame,
  onRefreshGames,
  notification,
  loading = false,
}) => (
  <Card
    style={{ marginBottom: "20px", height: "100%", alignContent: "center" }}
  >
    {notification?.type === "error" && (
      <ErrorMessage>{notification.message}</ErrorMessage>
    )}
    {notification?.type === "success" && (
      <SuccessMessage>{notification.message}</SuccessMessage>
    )}

    <div style={{ display: "flex", gap: "12px" }}>
      <Button variant="primary" onClick={onCreateGame} disabled={loading}>
        New Game
      </Button>
      <Button variant="secondary" onClick={onRefreshGames} disabled={loading}>
        Refresh Games
      </Button>
    </div>
  </Card>
);

export default QuickActionsCard;
