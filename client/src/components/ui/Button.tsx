import React from "react";
import { AppButton } from "@shychedelic/voidglass-react";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "warning"
  | "danger"
  | "default";

/** The subset VoidGlass forwards onto the element it renders. Anything wider
 *  would be silently dropped, so it is not offered. */
interface ButtonProps {
  variant?: ButtonVariant;
  className?: string;
  id?: string;
  title?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: () => void;
  children?: React.ReactNode;
}

/**
 * Blurtz's six variants over VoidGlass's five, so ~17 call sites keep the names
 * they already use. `warning` has no variant of its own in the library and is
 * expressed as an amber-coloured primary instead.
 */
const MAPPED: Record<
  ButtonVariant,
  { variant: "primary" | "secondary" | "ghost" | "outline" | "danger"; color?: "amber" }
> = {
  primary: { variant: "primary" },
  secondary: { variant: "secondary" },
  tertiary: { variant: "outline" },
  warning: { variant: "primary", color: "amber" },
  danger: { variant: "danger" },
  default: { variant: "ghost" },
};

export const Button: React.FC<ButtonProps> = ({
  variant = "default",
  className,
  children,
  disabled,
  onClick,
  type,
  id,
  title,
  style,
}) => {
  const mapped = MAPPED[variant];

  return (
    <AppButton
      variant={mapped.variant}
      color={mapped.color}
      disabled={disabled}
      onClick={onClick}
      className={className}
      id={id}
      title={title}
      style={style}
      type={type}
    >
      {children}
    </AppButton>
  );
};
