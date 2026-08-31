import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext, useUserStats } from "@hooks";
import { PageContainer, Card, Button, GameCard, CardNumber } from "@styles";
import { CARD_HUES } from "@styles/tokens";
import { CardSkinToggle } from "@components/ui/CardSkinToggle";

const PREVIEW: Array<{ color: string; type: "a" | "b"; value: number }> = [
  { color: "red", type: "a", value: 7 },
  { color: "blue", type: "a", value: 4 },
  { color: "yellow", type: "b", value: 9 },
  { color: "green", type: "b", value: 2 },
];

const Profile: React.FC = () => {
  const { user } = useAuthContext();
  const { gamesPlayed, gamesWon, winRate } = useUserStats(user);
  const navigate = useNavigate();

  return (
    <PageContainer>
      <div className="blurtz-pagebar">
        <div>
          <h1 className="blurtz-pagetitle">{user?.username ?? ""}</h1>
          <p className="blurtz-pagesub">Your record and how your cards look</p>
        </div>
        <Button variant="tertiary" onClick={() => navigate("/dashboard")}>
          Back to tables
        </Button>
      </div>

      <Card>
        <div className="blurtz-stats">
          <div className="blurtz-stat">
            <b>{gamesPlayed}</b>
            <span>Played</span>
          </div>
          <div className="blurtz-stat">
            <b>{gamesWon}</b>
            <span>Won</span>
          </div>
          <div className="blurtz-stat">
            <b>{`${winRate}%`}</b>
            <span>Rate</span>
          </div>
        </div>
      </Card>

      <Card style={{ marginTop: "16px" }}>
        <div className="blurtz-tables__label" style={{ marginTop: 0 }}>
          Card skin
        </div>
        <div className="blurtz-skinpreview" aria-hidden="true">
          {PREVIEW.map(({ color, type, value }) => (
            <GameCard
              key={color}
              hue={CARD_HUES[color]}
              cardType={type}
              size="foundation"
              disableHoverEffect
            >
              <CardNumber>{value}</CardNumber>
            </GameCard>
          ))}
        </div>
        <CardSkinToggle />
      </Card>
    </PageContainer>
  );
};

export default Profile;
