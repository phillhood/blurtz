import React, { HTMLAttributes, CSSProperties, forwardRef } from "react";
import clsx from "clsx";
import { CardColor } from "@types";

interface GameCardProps extends HTMLAttributes<HTMLDivElement> {
  color: string;
  pattern: {
    background: string;
    backgroundSize?: string;
    backgroundPosition?: string;
  };
  isDragging?: boolean;
  canDrop?: boolean;
  borderStyle?: "solid" | "dashed";
  disableHoverEffect?: boolean;
}

export const GameCard = forwardRef<HTMLDivElement, GameCardProps>(
  (
    {
      color,
      pattern,
      isDragging = false,
      canDrop = false,
      borderStyle = "solid",
      disableHoverEffect = false,
      className,
      children,
      style,
      ...props
    },
    ref
  ) => {
    const borderWidth = 4;

    const cardStyle: CSSProperties = {
      background: pattern.background,
      backgroundSize: pattern.backgroundSize,
      backgroundPosition: "center center",
      borderColor: canDrop ? undefined : color,
      borderStyle: borderStyle,
      borderWidth: canDrop ? undefined : borderWidth,
      opacity: isDragging ? 0.5 : 1,
      ...style,
    };

    return (
      <div
        ref={ref}
        className={clsx(
          "w-[90px] h-[120px] rounded-lg cursor-pointer flex items-center justify-center",
          "transition-all duration-200",
          !disableHoverEffect && "hover:-translate-y-0.5 hover:shadow-lg",
          canDrop
            ? "border-4 border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
            : "shadow-sm",
          className
        )}
        style={cardStyle}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GameCard.displayName = "GameCard";

export const CardNumber: React.FC<HTMLAttributes<HTMLSpanElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <span
      className={clsx(
        "font-['Germania_One'] text-[2.8rem] font-bold text-white",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};

interface CardStackProps extends HTMLAttributes<HTMLDivElement> {}

export const CardStack = forwardRef<HTMLDivElement, CardStackProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={clsx(
          "relative",
          "[&_.card]:absolute [&_.card]:top-0 [&_.card]:left-0",
          "[&_.card:nth-child(2)]:top-[-4px] [&_.card:nth-child(2)]:left-[-4px]",
          "[&_.card:nth-child(3)]:top-[-10px] [&_.card:nth-child(3)]:left-[-10px]",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardStack.displayName = "CardStack";

// Helper functions for card patterns
export const getCardColorString = (color: CardColor): string => {
  return color.code || color.name || "#000000";
};

export const getCardPattern = () => {
  return {
    background: "#1a1a1a", // Dark base for both
  };
};
