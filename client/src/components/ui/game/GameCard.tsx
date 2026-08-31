import React, { HTMLAttributes, CSSProperties, forwardRef } from "react";
import clsx from "clsx";

/**
 * The emissive skin's overline must land inside the strip a fanned card still
 * shows, so `overlineRatio` has to stay below `fanOffsetRatio`. Lower the fan
 * and the type cue is covered with nothing failing at runtime.
 */
export const CARD_GEOMETRY = {
  fanOffsetRatio: 0.2,
  overlineRatio: 0.13,
} as const;

export type CardSize = "play" | "foundation" | "token";

interface GameCardProps extends HTMLAttributes<HTMLDivElement> {
  hue: string;
  cardType: "a" | "b";
  size?: CardSize;
  faceDown?: boolean;
  isSelected?: boolean;
  isLegalTarget?: boolean;
  inFlight?: boolean;
  isDragging?: boolean;
  canDrop?: boolean;
  disableHoverEffect?: boolean;
}

export const GameCard = forwardRef<HTMLDivElement, GameCardProps>(
  (
    {
      hue,
      cardType,
      size = "play",
      faceDown = false,
      isSelected = false,
      isLegalTarget = false,
      inFlight = false,
      isDragging = false,
      canDrop = false,
      disableHoverEffect = false,
      className,
      children,
      style,
      ...props
    },
    ref
  ) => {
    const cardStyle = {
      "--hue": hue,
      opacity: isDragging ? 0.5 : 1,
      ...style,
    } as CSSProperties;

    return (
      <div
        ref={ref}
        data-testid="game-card"
        data-card-type={cardType}
        data-card-size={size}
        data-face-down={faceDown ? "true" : undefined}
        data-selected={isSelected ? "true" : undefined}
        data-legal-target={isLegalTarget ? "true" : undefined}
        data-in-flight={inFlight ? "true" : undefined}
        data-can-drop={canDrop ? "true" : undefined}
        className={clsx(
          "blurtz-card",
          !disableHoverEffect && "blurtz-card--hoverable",
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
    <span className={clsx("blurtz-card__numeral", className)} {...props}>
      {children}
    </span>
  );
};

interface CardStackProps extends HTMLAttributes<HTMLDivElement> {}

export const CardStack = forwardRef<HTMLDivElement, CardStackProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={clsx("blurtz-stack", className)} {...props}>
        {children}
      </div>
    );
  }
);

CardStack.displayName = "CardStack";
