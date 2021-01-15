import React, { useState } from 'react';
import _ from 'lodash';
import { useDrop } from 'react-dnd';
import { SinglePile } from './PileStyle';
import Card from './Card.jsx';
import { PILE_TYPES } from '../../constants';
import { CardPile } from '../../lib/cardpile';

const { WOOD, DISCARD, BLITZ } = PILE_TYPES;

const displayCards = (type, cardState, updateCardState) => {
  const { cards } = cardState;
  if (!cards.length) return <div></div>;
  const shownCards = [];
  let stackCounter = 0;
  let card;
  for (let i in cards) {
    card = cards[i];
    // if (card.faceUp) {
    shownCards.push(
      <Card
        card={card}
        pickCard={() => {
          cardState.pickCard();
          const newState = new CardPile(cardState.cards);
          updateCardState(newState);
        }}
        key={`${type}-${i}`}
        stack={stackCounter++}
        colour={card.colour}
        value={card.value}
        faceUp={card.faceUp}
        type={type}
      ></Card>
    );
    // }
  }
  return shownCards;
};

// const dropCard = (pile, card) => {
//   console.log(pile, card);
//   pile.push(card);
//   return pile;
// };

const Pile = ({ type, cardPile }) => {
  const [cardState, updateCardState] = useState(cardPile);
  console.log(cardState);
  const [collectedProps, drop] = useDrop({
    accept: [WOOD, DISCARD, BLITZ],
    drop: (item) => {
      const newCardState = new CardPile(cardState.cards);
      newCardState.dropCard(item.props.card);
      updateCardState(newCardState);
      console.log(newCardState);
    },
  });
  const cards = displayCards(type, cardState, updateCardState);
  return (
    <SinglePile ref={drop} key={`${type}-PILE`} type={type} cards={cardState}>
      {cards}
    </SinglePile>
  );
};

export default Pile;
