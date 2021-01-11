import React from 'react';
import { SinglePile } from './PileStyle';
import Card from './Card.jsx';

const generatePile = (type, cards) => {
  return (
    <SinglePile type={type} cards={cards}>
      {displayCard(cards)}
    </SinglePile>
  );
};

const displayCard = (cards) => {
  if (!cards.length) return <div></div>;
  const card = cards[cards.length - 1];
  return <Card colour={card.colour} value={card.value} faceUp={true}></Card>;
};

const Pile = (props) => {
  return generatePile(props.type, props.cards);
};

export default Pile;
