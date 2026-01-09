import React from "react";

interface LoadingSpinnerProps {
  size?: "small" | "medium" | "large";
  color?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "medium",
  color = "#3b82f6",
}) => {
  const sizeMap = {
    small: "20px",
    medium: "40px",
    large: "60px",
  };

  return (
    <div
      style={{
        width: sizeMap[size],
        height: sizeMap[size],
        border: `3px solid rgba(${color}, 0.3)`,
        borderTop: `3px solid ${color}`,
        borderRadius: "50%",
        animation: "spin 1s linear infinite",
      }}
    />
  );
};

export default LoadingSpinner;
