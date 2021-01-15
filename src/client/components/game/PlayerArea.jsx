import React from 'react';
import _ from 'lodash';
import { PILE_TYPES } from '../../constants';
import { Wrapper, TwoPlayerContainer } from './PlayerAreaStyle';
import Pile from './Pile.jsx';
// import { observe } from '../../lib/game';
import { CardPile } from '../../lib/cardpile';
const { WOOD, BLITZ, DISCARD } = PILE_TYPES;

const distributeCards = (deck) => {
  const woodPiles = [];
  const blitz = new CardPile();

  for (let i = 0; i < 5; i++) {
    if (!woodPiles[i]) woodPiles[i] = new CardPile();
    const card = deck.cards.shift();
    card.flip();
    woodPiles[i].dropCard(card);
  }

  for (let i = 0; i < 10; i++) {
    const card = deck.cards.shift();
    card.flip();
    blitz.dropCard(card);
  }

  const discard = new CardPile(_.map(deck.cards));

  return {
    wood: woodPiles,
    blitz: blitz,
    discard: discard,
  };
};

const PlayerArea = (props) => {
  const { wood, blitz, discard } = distributeCards(props.deck);
  return (
    <TwoPlayerContainer player={props.player}>
      <Wrapper>
        <Pile type={DISCARD} cardPile={discard}></Pile>
        <Pile type={WOOD} cardPile={wood[0]}></Pile>
        <Pile type={WOOD} cardPile={wood[1]}></Pile>
        <Pile type={WOOD} cardPile={wood[2]}></Pile>
        <Pile type={WOOD} cardPile={wood[3]}></Pile>
        <Pile type={WOOD} cardPile={wood[4]}></Pile>
        <Pile type={BLITZ} cardPile={blitz}></Pile>
      </Wrapper>
    </TwoPlayerContainer>
  );
};

export default PlayerArea;
