import React from "react";
import clsx from "clsx";

interface SeatIndicatorProps {
  filled: number;
  total: number;
  yoursSeated?: boolean;
}

/** Draws one silhouette per seat. `yoursSeated` claims the first filled seat for the viewer. */
export const SeatIndicator: React.FC<SeatIndicatorProps> = ({
  filled,
  total,
  yoursSeated,
}) => {
  return (
    <div className="blurtz-seats">
      {Array.from({ length: total }, (_, index) => (
        <i
          key={index}
          className={clsx(
            "blurtz-seat",
            index >= filled && "blurtz-seat--off",
            index < filled && (index === 0 && yoursSeated
              ? "blurtz-seat--you"
              : "blurtz-seat--on")
          )}
        />
      ))}
      <span className="sr-only">{`${filled} of ${total} seats taken`}</span>
    </div>
  );
};
