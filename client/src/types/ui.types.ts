// UI-related type definitions
export interface NotificationProps {
  type: "success" | "error" | "warning" | "info";
  message: string;
  onClose?: () => void;
}

export interface LoadingProps {
  loading?: boolean;
  title?: string;
  message?: string;
}

export interface ButtonProps {
  variant?: "primary" | "secondary" | "danger";
  size?: "small" | "medium" | "large";
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
}

export interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}
