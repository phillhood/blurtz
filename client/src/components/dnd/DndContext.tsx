import React, { ReactNode } from "react";
import {
  DndContext as DndKitContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from "@dnd-kit/core";
import { Card } from "@types";

export interface DragData {
  type: "card";
  card: Card;
  fromPileId: string;
}

interface GameDndContextProps {
  children: ReactNode;
  onDragStart?: (event: DragStartEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  dragOverlay?: ReactNode;
}

export const GameDndContext: React.FC<GameDndContextProps> = ({
  children,
  onDragStart,
  onDragOver,
  onDragEnd,
  dragOverlay,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 100,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  return (
    <DndKitContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      {children}
      {dragOverlay && <DragOverlay>{dragOverlay}</DragOverlay>}
    </DndKitContext>
  );
};
