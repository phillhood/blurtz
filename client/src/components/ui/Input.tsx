import React, { InputHTMLAttributes } from "react";
import clsx from "clsx";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input: React.FC<InputProps> = ({ className, ...props }) => {
  return (
    <input
      className={clsx(
        "w-full p-3 border border-gray-300 rounded-md text-base mb-4 text-gray-900",
        "focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10",
        className
      )}
      {...props}
    />
  );
};
