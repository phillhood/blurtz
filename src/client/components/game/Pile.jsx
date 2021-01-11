import React from 'react';
import { Wood, Blitz, Discard, Dutch } from './PileStyle';
import Card from './Card.jsx';
import { PILE_TYPES } from '../../constants';

const { WOOD, BLITZ, DISCARD, DUTCH } = PILE_TYPES;

const generatePile = (type, cards) => {
  switch (type) {
    case WOOD:
      return <Wood cards={cards}>{displayCard(cards)}</Wood>;
    case BLITZ:
      return <Blitz cards={cards}>{displayCard(cards)}</Blitz>;
    case DISCARD:
      return <Discard cards={cards}>{displayCard(cards)}</Discard>;
    case DUTCH:
      return <Dutch cards={cards}>{displayCard(cards)}</Dutch>;
  }
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
