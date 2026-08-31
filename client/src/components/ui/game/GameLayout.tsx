import React, { HTMLAttributes } from "react";
import clsx from "clsx";

interface LayoutProps extends HTMLAttributes<HTMLDivElement> {}

export const GameContainer: React.FC<LayoutProps> = ({ className, children, ...props }) => {
  return (
    <div
      className={clsx("blurtz-container", className)}
      data-testid="game-container"
      {...props}
    >
      {children}
    </div>
  );
};

interface GameBoardProps extends LayoutProps {
  isPicking?: boolean;
  isDealing?: boolean;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  isPicking = false,
  isDealing = false,
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={clsx("blurtz-board", className)}
      data-picking={isPicking ? "true" : undefined}
      data-dealing={isDealing ? "true" : undefined}
      data-testid="game-board"
      {...props}
    >
      {children}
    </div>
  );
};

interface OpponentsRowProps extends LayoutProps {
  opponentCount: number;
}

export const OpponentsRow: React.FC<OpponentsRowProps> = ({
  opponentCount,
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={clsx("blurtz-opponents", className)}
      data-opponent-count={opponentCount}
      data-testid="opponents-row"
      {...props}
    >
      {children}
    </div>
  );
};

export const CenterArea: React.FC<LayoutProps> = ({ className, children, ...props }) => {
  return (
    <div className={clsx("blurtz-center", className)} data-testid="center-area" {...props}>
      {children}
    </div>
  );
};

export const BankPiles: React.FC<LayoutProps> = ({ className, children, ...props }) => {
  return (
    <div className={clsx("blurtz-bank", className)} data-testid="bank-piles" {...props}>
      {children}
    </div>
  );
};

export const GameStatus: React.FC<LayoutProps> = ({ className, children, ...props }) => {
  return (
    <div
      className={clsx("text-center p-4 bg-slate-900 rounded-lg mb-5", className)}
      {...props}
    >
      {children}
    </div>
  );
};
