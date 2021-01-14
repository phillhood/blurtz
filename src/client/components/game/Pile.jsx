import React, { useState } from 'react';
import _ from 'lodash';
import { useDrop } from 'react-dnd';
import { SinglePile } from './PileStyle';
import Card from './Card.jsx';
import { PILE_TYPES } from '../../constants';
// import CardPile from '../../lib/cardpile';

const { WOOD, DISCARD, BLITZ } = PILE_TYPES;

const displayCards = (type, cards) => {
  if (!cards.length) return <div></div>;
  const shownCards = [];
  let stackCounter = 0;
  for (let i = cards.length - 1; i >= 0; i--) {
    const card = cards[i];
    shownCards.push(
      <Card
        key={`${type}-${i}`}
        stack={stackCounter++}
        colour={card.colour}
        value={card.value}
        faceUp={card.faceUp}
        type={type}
      ></Card>
    );
  }
  return shownCards;
};

const updateCards = (pile, card) => {
  pile.push(card);
};

const Pile = (props) => {
  // const [cards, updateCards] = useState(props.cards);
  const faceUp = _.remove(props.cards, (card) => card.faceUp);
  const [collectedProps, drop] = useDrop({
    accept: [WOOD, DISCARD, BLITZ],
    collect: (monitor) => ({
      // isOver: !!monitor.isOver(),
      // card: monitor.getItem(),
    }),
  });
  return (
    <SinglePile
      ref={drop}
      key={`${props.type}-PILE`}
      type={props.type}
      cards={props.cards}
    >
      {displayCards(props.type, faceUp)}
    </SinglePile>
  );
};

export default Pile;
