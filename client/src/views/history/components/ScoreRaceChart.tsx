import React from "react";
import clsx from "clsx";
import { GameResultsDetail } from "@types";

const YOU = "var(--color-purple-bright)";
const FIELD = "#7c8899";

const W = 620;
const H = 300;
const PL = 34;
const PR = 86;
const PT = 14;
const PB = 30;
const LO = -10;
const HEADROOM = 15;

interface ScoreRaceChartProps {
  detail: GameResultsDetail;
  me: string;
}

interface Series {
  username: string;
  points: number[];
}

const buildSeries = (detail: GameResultsDetail): Series[] => {
  const usernames = (detail.rounds[0]?.results ?? []).map((result) => result.username);

  return usernames.map((username) => {
    const points = [0];
    detail.rounds.forEach((round) => {
      const result = round.results.find((entry) => entry.username === username);
      points.push(result ? result.cumulativeScore : points[points.length - 1]);
    });
    return { username, points };
  });
};

const finalOf = (series: Series): number => series.points[series.points.length - 1];

const describe = (detail: GameResultsDetail, series: Series[]): string => {
  const rounds = detail.rounds.length;
  const finals = series.map((line) => `${line.username} ${finalOf(line)}`).join(", ");
  const winner = series.find((line) => line.username === detail.winnerUsername);
  const outcome = winner
    ? `${winner.username} wins on ${finalOf(winner)}`
    : "No winner was recorded";

  return `Cumulative score by round over ${rounds} ${rounds === 1 ? "round" : "rounds"}, to a target of ${detail.targetScore}. ${outcome}. Final scores: ${finals}.`;
};

/**
 * Cumulative-score race for one finished game. Highlight-one, not categorical:
 * `me` is purple, every opponent shares one muted grey, and identity is carried
 * by the label at the end of each line rather than by hue.
 */
const ScoreRaceChart: React.FC<ScoreRaceChartProps> = ({ detail, me }) => {
  const series = buildSeries(detail);
  const rounds = detail.rounds.length;
  const highest = series.reduce(
    (top, line) => Math.max(top, ...line.points),
    detail.targetScore
  );
  const hi = highest + HEADROOM;

  const x = (index: number) => PL + (index * (W - PL - PR)) / Math.max(rounds, 1);
  const y = (value: number) => PT + ((hi - value) * (H - PT - PB)) / (hi - LO);

  const step = detail.targetScore / 4;
  const ticks = [0, step, step * 2, step * 3];

  return (
    <svg
      className="blurtz-race"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={describe(detail, series)}
    >
      {ticks.map((value) => (
        <g key={value}>
          <line
            className="blurtz-race__grid"
            x1={PL}
            x2={W - PR}
            y1={y(value)}
            y2={y(value)}
          />
          <text
            className="blurtz-race__axis"
            x={PL - 8}
            y={y(value) + 3}
            textAnchor="end"
          >
            {Math.round(value)}
          </text>
        </g>
      ))}

      <line
        className="blurtz-race__target"
        x1={PL}
        x2={W - PR}
        y1={y(detail.targetScore)}
        y2={y(detail.targetScore)}
      />
      <text
        className="blurtz-race__axis"
        x={PL - 8}
        y={y(detail.targetScore) + 3}
        textAnchor="end"
      >
        {detail.targetScore}
      </text>
      <text
        className="blurtz-race__axis"
        x={PL + 6}
        y={y(detail.targetScore) - 7}
        textAnchor="start"
      >
        TARGET
      </text>

      <text className="blurtz-race__axis" x={x(0)} y={H - 10} textAnchor="middle">
        0
      </text>
      {detail.rounds.map((round, index) => (
        <text
          key={round.round}
          className="blurtz-race__axis"
          x={x(index + 1)}
          y={H - 10}
          textAnchor="middle"
        >
          {`R${round.round}`}
        </text>
      ))}

      {series.map((line) => {
        const mine = line.username === me;
        const stroke = mine ? YOU : FIELD;
        const last = line.points.length - 1;

        return (
          <g key={line.username}>
            <polyline
              className={clsx("blurtz-race__line", mine && "blurtz-race__line--me")}
              points={line.points.map((value, index) => `${x(index)},${y(value)}`).join(" ")}
              fill="none"
              stroke={stroke}
              strokeWidth={mine ? 3 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle
              className="blurtz-race__end"
              cx={x(last)}
              cy={y(line.points[last])}
              r={mine ? 4.5 : 3.5}
              fill={stroke}
            />
            <text
              className={clsx(
                "blurtz-race__label",
                mine && "blurtz-race__label--me"
              )}
              x={x(last) + 9}
              y={y(line.points[last]) + 3.5}
            >
              {`${line.username} ${line.points[last]}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export default ScoreRaceChart;
