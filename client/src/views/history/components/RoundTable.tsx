import React from "react";
import clsx from "clsx";
import { GameResultsDetail, GameRoundResult } from "@types";

interface RoundTableProps {
  detail: GameResultsDetail;
  me: string;
}

const signed = (value: number): string => (value > 0 ? `+${value}` : `${value}`);

const orderedUsernames = (detail: GameResultsDetail): string[] => {
  const last = detail.rounds[detail.rounds.length - 1];
  if (!last) {
    return [];
  }
  return [...last.results]
    .sort((a, b) => b.cumulativeScore - a.cumulativeScore)
    .map((result) => result.username);
};

/**
 * Round-by-round scores, rounds down and players across. Not a fallback for the
 * chart: it is the accessible equivalent and ships visible, so it carries the
 * per-round delta, the running total and who called Blurtz.
 */
const RoundTable: React.FC<RoundTableProps> = ({ detail, me }) => {
  const usernames = orderedUsernames(detail);

  return (
    <table className="blurtz-rounds">
      <caption className="sr-only">
        {`Round by round scores for ${detail.name}. Each cell shows that round's score, then the running total.`}
      </caption>
      <thead>
        <tr>
          <th scope="col">Round</th>
          {usernames.map((username) => (
            <th
              key={username}
              scope="col"
              className={clsx(username === me && "blurtz-rounds__head--me")}
            >
              {username}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {detail.rounds.map((round) => (
          <tr key={round.round}>
            <th scope="row">{`Round ${round.round}`}</th>
            {usernames.map((username) => {
              const result: GameRoundResult | undefined = round.results.find(
                (entry) => entry.username === username
              );
              const mine = username === me;

              return (
                <td
                  key={username}
                  className={clsx(
                    "blurtz-round__cell",
                    mine && "blurtz-round__cell--me"
                  )}
                >
                  {result ? (
                    <>
                      <span
                        className={clsx(
                          "blurtz-round__delta",
                          result.roundScore < 0 && "blurtz-round__delta--neg"
                        )}
                      >
                        {signed(result.roundScore)}
                      </span>
                      {result.calledBlurtz && (
                        <span
                          className="blurtz-round__blurtz"
                          role="img"
                          aria-label={`${username} called Blurtz`}
                          title={`${username} called Blurtz`}
                        />
                      )}
                      <span className="blurtz-round__cum">
                        {`= ${result.cumulativeScore}`}
                      </span>
                    </>
                  ) : (
                    <span className="blurtz-round__delta">—</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default RoundTable;
