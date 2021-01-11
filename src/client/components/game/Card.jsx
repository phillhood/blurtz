import React, { memo } from 'react';
import { Cardface } from './CardStyle';

const Card = ({ cardColour, cardText }) => {
  return <Cardface colour={cardColour}>{cardText}</Cardface>;
};

export default memo(Card);
