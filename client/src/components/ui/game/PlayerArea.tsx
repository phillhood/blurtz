import React, { HTMLAttributes } from "react";
import clsx from "clsx";

interface PlayerAreaProps extends HTMLAttributes<HTMLDivElement> {
  isOpponent?: boolean;
  opponentCount?: number;
  hasBlurtzButton?: boolean;
  isExpanding?: boolean;
}

const getOpponentScale = (count: number): number => {
  switch (count) {
    case 1:
      return 0.85;
    case 2:
      return 0.75;
    case 3:
      return 0.65;
    default:
      return 0.6;
  }
};

const getOpponentMaxWidth = (count: number): string => {
  switch (count) {
    case 1:
      return "800px";
    case 2:
      return "700px";
    case 3:
      return "600px";
    default:
      return "560px";
  }
};

export const PlayerArea: React.FC<PlayerAreaProps> = ({
  isOpponent = false,
  opponentCount = 1,
  hasBlurtzButton = false,
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
  opponentCount = 1,
  className,
  children,
  style,
  ...props
}) => {
  const scale = isOpponent ? getOpponentScale(opponentCount) : 1;
  const maxWidth = isOpponent ? getOpponentMaxWidth(opponentCount) : "1000px";

  return (
    <div
      className={clsx(
        "flex flex-row justify-center items-start relative w-full h-full",
        isOpponent ? "gap-5" : "gap-12 mx-auto",
        className
      )}
      style={{
        transform: `scale(${scale})`,
        maxWidth,
        ...style,
      }}
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
        "text-center m-0 text-amber-400 font-['Germania_One']",
        isOpponent ? "text-xl" : "text-3xl",
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
        "text-center font-['Germania_One']",
        isOpponent ? "text-sm" : "text-lg",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
