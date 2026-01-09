import React, { HTMLAttributes } from "react";
import clsx from "clsx";

interface LayoutProps extends HTMLAttributes<HTMLDivElement> {}

export const AppContainer: React.FC<LayoutProps> = ({ className, children, ...props }) => {
  return (
    <div
      className={clsx(
        "min-h-screen bg-gradient-to-br from-[#1e3c72] to-[#2a5298] text-white",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const PageContainer: React.FC<LayoutProps> = ({ className, children, ...props }) => {
  return (
    <div className={clsx("max-w-[1200px] mx-auto p-5", className)} {...props}>
      {children}
    </div>
  );
};

export const Card: React.FC<LayoutProps> = ({ className, children, ...props }) => {
  return (
    <div
      className={clsx(
        "bg-white rounded-lg p-6 shadow-md text-gray-800",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const Form: React.FC<React.FormHTMLAttributes<HTMLFormElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <form className={clsx("flex flex-col gap-4", className)} {...props}>
      {children}
    </form>
  );
};

export const Title: React.FC<HTMLAttributes<HTMLHeadingElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <h1
      className={clsx(
        "font-['Germania_One'] text-[2.5rem] font-bold text-center mb-8",
        "bg-white bg-clip-text text-transparent",
        className
      )}
      {...props}
    >
      {children}
    </h1>
  );
};

export const ErrorMessage: React.FC<LayoutProps> = ({ className, children, ...props }) => {
  return (
    <div
      className={clsx(
        "bg-red-100 text-red-600 p-3 rounded-md mb-4 border border-red-200",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const SuccessMessage: React.FC<LayoutProps> = ({ className, children, ...props }) => {
  return (
    <div
      className={clsx(
        "bg-green-100 text-green-600 p-3 rounded-md mb-4 border border-green-200",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
