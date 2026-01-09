import React, { HTMLAttributes } from "react";
import clsx from "clsx";

interface LayoutProps extends HTMLAttributes<HTMLDivElement> {}

export const GameContainer: React.FC<LayoutProps> = ({ className, children, ...props }) => {
  return (
    <div
      className={clsx(
        "flex flex-col h-[calc(100vh-80px)] bg-slate-900 text-white",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const GameBoard: React.FC<LayoutProps> = ({ className, children, ...props }) => {
  return (
    <div
      className={clsx(
        "grid grid-rows-[auto_1fr_auto] gap-5 w-[90%] max-w-[1400px] mx-auto",
        className
      )}
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
  const gapClass = opponentCount <= 1 ? "gap-5" : opponentCount === 2 ? "gap-4" : "gap-2.5";

  return (
    <div
      className={clsx(
        "flex justify-center items-center py-2.5 min-h-[180px] w-full row-start-1",
        gapClass,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CenterArea: React.FC<LayoutProps> = ({ className, children, ...props }) => {
  return (
    <div
      className={clsx(
        "flex flex-col items-center gap-5 justify-center pb-2.5 row-start-2",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const BankPiles: React.FC<LayoutProps> = ({ className, children, ...props }) => {
  return (
    <div className={clsx("flex justify-center gap-5", className)} {...props}>
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
