import React from 'react';
import { useDrag } from 'react-dnd';
import { Cardface, Cardback, Value } from './CardStyle';

const Card = (props) => {
  const { draggable, faceUp, stack, type, colour, value, pickCard } = props;
  const [{ isDragging }, drag] = useDrag({
    item: { type: type, props: props },
    end: (item, monitor) => {
      const dropResult = monitor.didDrop();
      if (item && monitor.didDrop()) {
        pickCard();
      }
    },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
      card: monitor.getItem(),
    }),
  });
  return faceUp ? (
    <Cardface
      ref={draggable ? drag : () => {}}
      stack={stack}
      type={type}
      colour={colour}
      opacity={isDragging ? 0.5 : 1}
    >
      <Value>{value}</Value>
    </Cardface>
  ) : (
    <Cardback type={type} colour={colour}></Cardback>
  );
};

export default Card;
