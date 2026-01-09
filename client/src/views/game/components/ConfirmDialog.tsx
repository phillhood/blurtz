import React from "react";
import clsx from "clsx";

interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: "primary" | "danger" | "warning" | "success";
  isOpen?: boolean;
}

const variantStyles = {
  primary:
    "bg-gradient-to-br from-blue-500 to-blue-600 border-blue-700 hover:from-blue-600 hover:to-blue-700 hover:shadow-[0_4px_12px_rgba(59,130,246,0.3)]",
  danger:
    "bg-gradient-to-br from-red-500 to-red-600 border-red-700 hover:from-red-600 hover:to-red-700 hover:shadow-[0_4px_12px_rgba(239,68,68,0.3)]",
  warning:
    "bg-gradient-to-br from-amber-500 to-amber-600 border-amber-700 hover:from-amber-600 hover:to-amber-700 hover:shadow-[0_4px_12px_rgba(245,158,11,0.3)]",
  success:
    "bg-gradient-to-br from-emerald-500 to-emerald-600 border-emerald-700 hover:from-emerald-600 hover:to-emerald-700 hover:shadow-[0_4px_12px_rgba(16,185,129,0.3)]",
};

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "primary",
  isOpen = true,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className={clsx(
          "bg-gradient-to-br from-slate-800 to-slate-700 rounded-xl",
          "shadow-2xl border border-slate-600",
          "min-w-[400px] max-w-[500px]",
          "animate-dialog-slide-in",
          "max-md:min-w-[320px] max-md:max-w-[90vw] max-md:mx-5"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 border-b border-slate-600 mb-5">
          <h3 className="text-slate-50 text-2xl font-semibold m-0 mb-4 font-['Germania_One']">
            {title}
          </h3>
        </div>

        {/* Body */}
        <div className="px-6 pb-5">
          <p className="text-slate-300 text-base leading-relaxed m-0">{message}</p>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6 pt-5 justify-end">
          <button
            className={clsx(
              "px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer",
              "transition-all duration-200 border min-w-[80px]",
              "bg-slate-600 text-slate-50 border-slate-500",
              "hover:-translate-y-0.5 hover:bg-slate-500 hover:border-slate-400",
              "active:translate-y-0",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            )}
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            className={clsx(
              "px-5 py-2.5 rounded-lg text-sm font-semibold text-white cursor-pointer",
              "transition-all duration-200 border min-w-[80px]",
              "hover:-translate-y-0.5",
              "active:translate-y-0",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
              variantStyles[variant]
            )}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
