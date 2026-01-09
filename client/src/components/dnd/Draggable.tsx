import React, { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@types";

export interface DraggableCardData {
  type: "card";
  card: Card;
  fromPileId: string;
}

interface DraggableProps {
  id: string;
  data: DraggableCardData;
  disabled?: boolean;
  children: ReactNode;
}

export const Draggable: React.FC<DraggableProps> = ({
  id,
  data,
  disabled = false,
  children,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id,
      data,
      disabled,
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: disabled ? "default" : "grab",
    touchAction: "none",
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
};
