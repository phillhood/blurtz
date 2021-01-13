import React, { useState } from 'react';
import { useDrop } from 'react-dnd';
import { SinglePile } from './PileStyle';
import Card from './Card.jsx';
import { PILE_TYPES } from '../../constants';

const { WOOD, DISCARD, BLITZ } = PILE_TYPES;

const displayCards = (type, cards) => {
  if (!cards.length) return <div></div>;
  const shownCards = [];
  let stackCounter = 0;
  for (let i = cards.length - 1; i >= 0; i--) {
    const card = cards[i];
    if (card.faceUp) {
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
  }
  return shownCards;
};

const updateCards = (type, cards) => {};

const Pile = (props) => {
  const [cards, updateCards] = useState(props.cards);
  const [{ isOver }, drop] = useDrop({
    accept: [WOOD, DISCARD, BLITZ],
    drop: (card, monitor) => {
      updateCards(card);
    },
    collect: (monitor, props) => ({
      isOver: !!monitor.isOver(),
    }),
  });
  return (
    <SinglePile
      ref={drop}
      key={`${props.type}-PILE`}
      type={props.type}
      cards={props.cards}
    >
      {displayCards(props.type, cards)}
    </SinglePile>
  );
};

export default Pile;
