import React, { useEffect, useState } from "react";

interface GameToastProps {
  message: string;
  duration?: number;
  onDismiss: () => void;
}

const GameToast: React.FC<GameToastProps> = ({
  message,
  duration = 3000,
  onDismiss,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true));

    // Start exit animation before dismissing
    const exitTimer = setTimeout(() => {
      setIsLeaving(true);
    }, duration - 300);

    // Actually dismiss
    const dismissTimer = setTimeout(() => {
      onDismiss();
    }, duration);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(dismissTimer);
    };
  }, [duration, onDismiss]);

  return (
    <div
      style={{
        position: "fixed",
        top: "80px",
        left: "50%",
        transform: `translateX(-50%) translateY(${isVisible && !isLeaving ? "0" : "-20px"})`,
        opacity: isVisible && !isLeaving ? 1 : 0,
        transition: "all 0.3s ease-out",
        zIndex: 1000,
        padding: "12px 24px",
        backgroundColor: "rgba(239, 68, 68, 0.95)",
        color: "white",
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
        fontFamily: "Germania One, sans-serif",
        fontSize: "1rem",
        maxWidth: "90vw",
        textAlign: "center",
      }}
    >
      {message}
    </div>
  );
};

export default GameToast;
