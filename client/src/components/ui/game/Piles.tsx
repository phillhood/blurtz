import React, { HTMLAttributes } from "react";
import clsx from "clsx";

interface PileProps extends HTMLAttributes<HTMLDivElement> {}

export const BlurtzPile: React.FC<PileProps> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={clsx(
        "w-[88px] h-[118px] border-2 border-dashed border-slate-500 rounded-lg",
        "flex items-center justify-center bg-slate-700/50 relative",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const WorkPiles: React.FC<PileProps> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div className={clsx("flex gap-4 justify-center", className)} {...props}>
      {children}
    </div>
  );
};

export const WorkPile: React.FC<PileProps> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={clsx(
        "w-[88px] h-[118px] relative",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const DrawPile: React.FC<PileProps> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={clsx(
        "w-[88px] h-[118px] border-2 border-slate-400 rounded-lg",
        "flex items-center justify-center bg-slate-600 relative",
        "cursor-pointer transition-all duration-200",
        "hover:bg-slate-500 hover:-translate-y-0.5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const PileLabel: React.FC<HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={clsx(
        "text-center text-lg font-['Germania_One'] text-slate-400 whitespace-nowrap",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const PileCount: React.FC<HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={clsx(
        "text-center text-lg font-['Germania_One'] text-slate-400 whitespace-nowrap pt-2",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
