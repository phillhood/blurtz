import React, { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

type ButtonVariant = "primary" | "secondary" | "tertiary" | "warning" | "danger" | "default";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-[#1C92A9] hover:bg-[rgb(86,183,202)] disabled:hover:bg-[#1C92A9]",
  secondary: "bg-[rgb(32,158,127)] hover:bg-[rgb(101,177,158)] disabled:hover:bg-[rgb(32,158,127)]",
  tertiary: "bg-[rgb(26,104,168)] hover:bg-[rgb(48,134,204)] disabled:hover:bg-[rgb(26,104,168)]",
  warning: "bg-[rgb(199,155,36)] hover:bg-[rgb(219,183,82)] disabled:hover:bg-[rgb(199,155,36)]",
  danger: "bg-[rgb(199,77,77)] hover:bg-[rgb(218,113,113)] disabled:hover:bg-[rgb(199,77,77)]",
  default: "bg-[rgb(132,134,150)] hover:bg-[rgb(152,157,167)] disabled:hover:bg-[rgb(132,134,150)]",
};

export const Button: React.FC<ButtonProps> = ({
  variant = "default",
  className,
  children,
  ...props
}) => {
  return (
    <button
      className={clsx(
        "px-6 py-3 border-none rounded-md text-base font-semibold text-white cursor-pointer",
        "transition-all duration-100 ease-in-out",
        "active:scale-[0.98] active:shadow-sm",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};
