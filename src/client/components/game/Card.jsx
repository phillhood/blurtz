import React from 'react';
import { Cardface, Value } from './CardStyle';

const Card = (props) => {
  return (
    <Cardface type={props.colour.type} colour={props.colour.code}>
      <Value>{props.value}</Value>
    </Cardface>
  );
};

export default Card;
