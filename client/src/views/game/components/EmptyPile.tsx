import React from "react";

interface EmptyPileProps {
  label: string;
  size?: "small" | "medium" | "large";
}

const EmptyPile: React.FC<EmptyPileProps> = ({ label, size = "medium" }) => {
  const sizeStyles = {
    small: { fontSize: "0.7rem" },
    medium: { fontSize: "0.8rem" },
    large: { fontSize: "0.9rem" },
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#94a3b8",
        border: "2px dashed #e5e7eb",
        borderRadius: "6px",
        ...sizeStyles[size],
      }}
    >
      {label}
    </div>
  );
};

export default EmptyPile;
