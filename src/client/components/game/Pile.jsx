import React, { useState } from 'react';
import _ from 'lodash';
import { useDrop } from 'react-dnd';
import useEventListener from '@use-it/event-listener';
import { SinglePile } from './PileStyle';
import Card from './Card.jsx';
import { PILE_TYPES } from '../../constants';
import { CardPile } from '../../lib/cardpile';

const { WOOD, DISCARD, BLITZ } = PILE_TYPES;

const displayCards = (type, pile, updatePile) => {
  const { cards } = pile;
  if (!cards.length) return <div></div>;
  const shownCards = [];
  let stackCounter = -1;
  let card;
  for (let i in cards) {
    card = cards[i];
    if (card.faceUp) {
      stackCounter++;
      shownCards.push(
        <Card
          card={card}
          pickCard={() => {
            pile.pickCard();
            updatePile(new CardPile(pile.cards));
          }}
          key={`${type}-${i}`}
          stack={stackCounter}
          colour={card.colour}
          value={card.value}
          faceUp={card.faceUp}
          type={type}
        ></Card>
      );
    }
  }
  // return type === DISCARD ? shownCards.reverse() : shownCards;
  return shownCards;
};

const dealHand = ({ cards }) => {
  const newPile = new CardPile(cards);
  let numToDeal = 3;
  let index = cards.length - 1;
  if (!newPile.faceDown.length) {
    newPile.cards.forEach((card) => {
      card.flip();
      console.log('flip');
    });
  } else {
    while (numToDeal && index > -1) {
      if (!newPile.cards[index].faceUp) {
        newPile.cards[index].flip();
        numToDeal--;
      }
      index--;
    }
  }
  return newPile;
};
// const

// const dropCard = (pile, card) => {
//   console.log(pile, card);
//   pile.push(card);
//   return pile;
// };

const Pile = ({ player, type, cardPile }) => {
  const [pile, updatePile] = useState(cardPile);
  const [c, drop] = useDrop({
    accept: type === WOOD ? [WOOD, DISCARD, BLITZ] : '',
    drop: (item) => {
      const newpile = new CardPile(pile.cards);
      newpile.dropCard(item.props.card);
      updatePile(newpile);
    },
  });
  const cards = displayCards(type, pile, updatePile);
  if (type === DISCARD && player === 1)
    useEventListener('keydown', ({ key }) => {
      if (key === ' ') {
        updatePile(dealHand(pile));
      }
    });
  return (
    <SinglePile ref={drop} key={`${type}-PILE`} type={type} cards={pile}>
      {cards}
    </SinglePile>
  );
};

export default Pile;
