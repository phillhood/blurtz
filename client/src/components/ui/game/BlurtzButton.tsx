import React, { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

interface BlurtzButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isPulsing?: boolean;
  isAnimatingIn?: boolean;
}

export const BlurtzButton: React.FC<BlurtzButtonProps> = ({
  isPulsing = false,
  isAnimatingIn = false,
  className,
  children,
  ...props
}) => {
  return (
    <button
      className={clsx(
        "bg-gradient-to-br from-red-500 to-red-600 text-white border-none rounded-lg",
        "px-6 py-3 text-lg font-bold font-['Germania_One'] cursor-pointer mt-4",
        "transition-all duration-300",
        "[text-shadow:_0_1px_2px_rgba(0,0,0,0.5)]",
        "shadow-[0_4px_8px_rgba(0,0,0,0.3)]",
        "hover:bg-gradient-to-br hover:from-red-600 hover:to-red-700",
        "hover:-translate-y-0.5 hover:shadow-[0_6px_12px_rgba(0,0,0,0.4)]",
        "active:translate-y-0 active:shadow-[0_2px_4px_rgba(0,0,0,0.3)]",
        "disabled:bg-gray-500 disabled:cursor-not-allowed disabled:transform-none disabled:animate-none",
        isAnimatingIn && "animate-blitz-slide-in",
        isPulsing && "animate-pulse-custom",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};
