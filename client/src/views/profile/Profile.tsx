import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext, useUserStats } from "@hooks";
import { PageContainer, Card, Button } from "@styles";
import { CardSkinToggle } from "@components/ui/CardSkinToggle";

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
        <CardSkinToggle />
      </Card>
    </PageContainer>
  );
};

export default Profile;
