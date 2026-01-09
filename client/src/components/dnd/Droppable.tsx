import React, { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";

interface DroppableProps {
  id: string;
  data?: Record<string, unknown>;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

export const Droppable: React.FC<DroppableProps> = ({
  id,
  data,
  disabled = false,
  children,
  className,
}) => {
  const { setNodeRef, isOver, active } = useDroppable({
    id,
    data,
    disabled,
  });

  const isValidDrop = isOver && active;

  return (
    <div
      ref={setNodeRef}
      className={`${className || ""} ${isValidDrop ? "drop-target" : ""}`}
      data-is-over={isOver}
      data-is-active={!!active}
    >
      {children}
    </div>
  );
};
