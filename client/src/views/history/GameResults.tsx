import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "@shychedelic/voidglass-react";
import { GameResultsDetail } from "@types";
import { useAuthContext, useGameResults } from "@hooks";
import { PageContainer, Button } from "@styles";
import { LoadingSpinner } from "@components/ui";
import { ScoreRaceChart, RoundTable } from "./components";

const ORDINALS = ["1st", "2nd", "3rd", "4th"];

interface Standing {
  username: string;
  finalScore: number;
}

const finalStandings = (detail: GameResultsDetail): Standing[] => {
  const last = detail.rounds[detail.rounds.length - 1];
  if (!last) {
    return [];
  }
  return last.results
    .map((r) => ({ username: r.username, finalScore: r.cumulativeScore }))
    .sort((a, b) => b.finalScore - a.finalScore);
};

const GameResults: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const { user } = useAuthContext();
  const { data, isLoading, isError } = useGameResults(gameId);
  const navigate = useNavigate();

  const me = user?.username ?? "";

  if (isLoading) {
    return (
      <PageContainer>
        <div className="blurtz-tables__loading">
          <LoadingSpinner size="medium" />
        </div>
      </PageContainer>
    );
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <div className="blurtz-pagebar">
          <div>
            <h1 className="blurtz-pagetitle">Results</h1>
          </div>
          <Button variant="tertiary" onClick={() => navigate("/profile/history")}>
            Back to history
          </Button>
        </div>
        <EmptyState
          title="That game is not yours to view"
          description="Results are only visible to the players who sat at the table."
        />
      </PageContainer>
    );
  }

  const standings = finalStandings(data);
  const place = standings.findIndex((s) => s.username === me);
  const myFinal = place >= 0 ? standings[place].finalScore : 0;
  const average = data.rounds.length > 0 ? myFinal / data.rounds.length : 0;

  return (
    <PageContainer>
      <div className="blurtz-pagebar">
        <div>
          <h1 className="blurtz-pagetitle">{data.name}</h1>
          <p className="blurtz-pagesub">
            {`${data.rounds.length} rounds · first to ${data.targetScore}`}
            {data.winnerUsername ? ` · won by ${data.winnerUsername}` : ""}
          </p>
        </div>
        <Button variant="tertiary" onClick={() => navigate("/profile/history")}>
          Back to history
        </Button>
      </div>

      <div className="blurtz-stats">
        <div className="blurtz-stat">
          <b>{myFinal}</b>
          <span>Your final</span>
        </div>
        <div className="blurtz-stat">
          <b>{place >= 0 ? ORDINALS[place] ?? `${place + 1}th` : "—"}</b>
          <span>{`Of ${standings.length}`}</span>
        </div>
        <div className="blurtz-stat">
          <b>{average.toFixed(1)}</b>
          <span>Your avg round</span>
        </div>
      </div>

      <div className="blurtz-results">
        <section className="blurtz-panel">
          <h2 className="blurtz-panel__title">Cumulative score by round</h2>
          <div className="blurtz-legend">
            <span className="blurtz-legend__item blurtz-legend__item--me">
              <i />
              {me || "you"}
            </span>
            <span className="blurtz-legend__item">
              <i />
              opponents
            </span>
            <span className="blurtz-legend__item blurtz-legend__item--target">
              <i />
              {`target ${data.targetScore}`}
            </span>
          </div>
          <div className="blurtz-race__scroll">
            <ScoreRaceChart detail={data} me={me} />
          </div>
        </section>
        <section className="blurtz-panel">
          <h2 className="blurtz-panel__title">Round by round</h2>
          <div className="blurtz-rounds__scroll">
            <RoundTable detail={data} me={me} />
          </div>
          <p className="blurtz-panel__foot">
            Large number: that round. Small: running total.
          </p>
        </section>
      </div>
    </PageContainer>
  );
};

export default GameResults;
