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
"blurtz-slot blurtz-slot--empty",
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
    <div className={clsx("blurtz-workpiles", className)} {...props}>
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
"blurtz-slot",
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
"blurtz-slot blurtz-slot--empty cursor-pointer",
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
"blurtz-pile-label",
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
"blurtz-pile-label blurtz-pile-label--count",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
