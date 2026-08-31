import React from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "@shychedelic/voidglass-react";
import { useAuthContext, useMatchHistory } from "@hooks";
import { PageContainer, Button } from "@styles";
import { LoadingSpinner } from "@components/ui";
import { HistoryRow, ProfileTabs } from "./components";

const History: React.FC = () => {
  const { user } = useAuthContext();
  const { data, isLoading, isError } = useMatchHistory();
  const navigate = useNavigate();

  return (
    <PageContainer>
      <div className="blurtz-pagebar">
        <div>
          <h1 className="blurtz-pagetitle">{user?.username ?? ""}</h1>
          <p className="blurtz-pagesub">Every game you have finished</p>
        </div>
        <Button variant="tertiary" onClick={() => navigate("/dashboard")}>
          Back to tables
        </Button>
      </div>

      <ProfileTabs active="history" />

      {isLoading ? (
        <div className="blurtz-tables__loading">
          <LoadingSpinner size="medium" />
        </div>
      ) : isError ? (
        <EmptyState
          title="Could not load your match history"
          description="Something went wrong reaching the server. Try again in a moment."
        />
      ) : data && data.length > 0 ? (
        <div className="blurtz-historylist">
          {data.map((item) => (
            <HistoryRow
              key={item.gameId}
              item={item}
              me={user?.username ?? ""}
              onOpen={(gameId) => navigate(`/profile/history/${gameId}`)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No finished games yet"
          description="Play a game through to the target score and it will show up here."
        />
      )}
    </PageContainer>
  );
};

export default History;
