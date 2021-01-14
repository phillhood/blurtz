import React from 'react';
import { useDrag } from 'react-dnd';
import { Cardface, Cardback, Value } from './CardStyle';

const Card = (props) => {
  const [{ isDragging }, drag] = useDrag({
    item: { type: props.type, props: props },
    end: (item, monitor) => {
      const dropResult = monitor.getItem();
      if (item && dropResult) {
        console.log('Dropped  ', item, ' into ', dropResult.type);
      }
    },
    collect: (monitor) => ({
      // isDragging: !!monitor.isDragging(),
      card: monitor.getItem(),
    }),
  });
  return props.faceUp ? (
    <Cardface
      ref={drag}
      stack={props.stack}
      type={props.type}
      colour={props.colour}
      opacity={isDragging ? 0.5 : 1}
    >
      <Value>{props.value}</Value>
    </Cardface>
  ) : (
    <Cardback type={props.type} colour={props.colour}></Cardback>
  );
};

export default Card;
