import React, { useState } from 'react';
import _ from 'lodash';
import { useDrop } from 'react-dnd';
import useEventListener from '@use-it/event-listener';
import { SinglePile } from './PileStyle';
import Card from './Card.jsx';
import { PILE_TYPES } from '../../constants';
import { CardPile } from '../../lib/cardpile';
import { allowWoodDrop, allowDutchDrop } from '../../lib/game';

const { WOOD, DISCARD, DUTCH, BLITZ } = PILE_TYPES;

const displayCards = (type, pile, updatePile) => {
  const { cards, faceUp } = pile;
  if (!cards.length) return <div></div>;
  const shownCards = [];
  let stackCounter = -1;
  let card;
  for (let i in faceUp) {
    card = faceUp[i];
    stackCounter++;
    shownCards.push(
      <Card
        card={card}
        pickCard={() => {
          pile.pickCard();
          updatePile(new CardPile(type, pile.cards));
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
  return shownCards;
};

const dealHand = ({ type, cards }) => {
  const newPile = new CardPile(type, cards);
  let numToDeal = 3;
  let index = cards.length - 1;
  if (!newPile.faceDown.length) {
    newPile.flipPile();
  } else {
    while (numToDeal && index > -1) {
      if (!newPile.cards[index].faceUp) {
        newPile.flipCard(index);
        numToDeal--;
      }
      index--;
    }
  }
  return newPile;
};

const allowDrop = (type, pile, card) => {
  switch (type) {
    case WOOD:
      return allowWoodDrop(pile, card);
    case DUTCH:
      return allowDutchDrop(pile, card);
  }
};

const acceptDrop = (type) => {
  switch (type) {
    case WOOD:
      return [WOOD, DISCARD, BLITZ];
    case DUTCH:
      return [WOOD, DISCARD, BLITZ];
    case BLITZ:
      return '';
    case DISCARD:
      return '';
  }
};

const Pile = ({ player, type, cardPile }) => {
  const [pile, updatePile] = useState(cardPile);
  const [cardProps, drop] = useDrop({
    accept: acceptDrop(type),
    canDrop: (item, monitor) => {
      return allowDrop(type, pile, monitor.getItem().props);
    },
    drop: (item) => {
      const newpile = new CardPile(type, pile.cards);
      newpile.dropCard(item.props.card);
      updatePile(newpile);
    },
  });
  if (type === DISCARD && player === 1)
    useEventListener('keydown', ({ key }) => {
      if (key === ' ') {
        updatePile(dealHand(pile));
      }
    });
  const cards = displayCards(type, pile, updatePile);
  return (
    <SinglePile ref={drop} key={`${type}-PILE`} type={type} cards={pile}>
      {cards}
    </SinglePile>
  );
};

export default Pile;
