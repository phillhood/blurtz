import React from 'react';
import { useDrag } from 'react-dnd';
import { Cardface, Cardback, Value } from './CardStyle';

const Card = (props) => {
  const [{ isDragging }, drag] = useDrag({
    item: { type: props.type },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  });
  return props.faceUp ? (
    <Cardface
      ref={drag}
      stack={props.stack}
      type={props.colour.type}
      colour={props.colour.code}
      opacity={isDragging ? 0.5 : 1}
    >
      <Value>{props.value}</Value>
    </Cardface>
  ) : (
    <Cardback type={props.colour.type} colour={props.colour.code}></Cardback>
  );
};

export default Card;
