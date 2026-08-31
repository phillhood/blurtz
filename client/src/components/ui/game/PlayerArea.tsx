import React, { HTMLAttributes } from "react";
import clsx from "clsx";

interface PlayerAreaProps extends HTMLAttributes<HTMLDivElement> {
  isOpponent?: boolean;
  opponentCount?: number;
  hasBlurtzButton?: boolean;
  isExpanding?: boolean;
}

export const PlayerArea: React.FC<PlayerAreaProps> = ({
  isOpponent = false,
  // Named out of `props` on purpose and then not used: this component spreads
  // `{...props}` onto a <div>, and React would pass an unrecognised
  // `opponentCount`/`hasBlurtzButton` straight through to the DOM and warn
  // about it. Callers do send both (see `views/game/components/PlayerArea`).
  // The `_` prefix is this codebase's marker for a deliberately unused binding;
  // the prop keeps its name.
  opponentCount: _opponentCount = 1,
  hasBlurtzButton: _hasBlurtzButton = false,
  isExpanding = false,
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={clsx(
        "flex flex-col rounded-xl items-center bg-slate-800/80",
        isOpponent
          ? "gap-2 py-3 px-3"
          : "gap-4 pt-4 pb-20 px-5 mb-6 border-[3px] border-slate-400",
        isExpanding && "animate-[expandPlayerArea_0.6s_ease-out]",
        !isOpponent && "row-start-3",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

interface CardAreaProps extends HTMLAttributes<HTMLDivElement> {
  isOpponent?: boolean;
  opponentCount?: number;
}

export const CardArea: React.FC<CardAreaProps> = ({
  isOpponent = false,
  opponentCount: _cardAreaOpponentCount = 1,
  className,
  children,
  style,
  ...props
}) => {
  return (
    <div
      className={clsx(
        "flex flex-row flex-wrap justify-center items-start relative",
        isOpponent ? "gap-2" : "gap-4 sm:gap-8 mx-auto",
        className
      )}
      data-card-size={isOpponent ? "token" : "play"}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
};

interface PlayerNameProps extends HTMLAttributes<HTMLHeadingElement> {
  isOpponent?: boolean;
}

export const PlayerName: React.FC<PlayerNameProps> = ({
  isOpponent = false,
  className,
  children,
  ...props
}) => {
  return (
    <h3
      className={clsx(
        "text-center m-0 text-amber-400 font-[family-name:var(--font-display)] font-bold",
        isOpponent ? "text-sm" : "text-2xl",
        className
      )}
      {...props}
    >
      {children}
    </h3>
  );
};

interface ScoreDisplayProps extends HTMLAttributes<HTMLDivElement> {
  isOpponent?: boolean;
}

export const ScoreDisplay: React.FC<ScoreDisplayProps> = ({
  isOpponent = false,
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={clsx(
        "text-center font-[family-name:var(--font-body)]",
        isOpponent ? "text-xs" : "text-base",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
