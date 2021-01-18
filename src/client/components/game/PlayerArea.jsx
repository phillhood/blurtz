import React from 'react';
import _ from 'lodash';
import { PILE_TYPES } from '../../constants';
import { Wrapper, TwoPlayerContainer } from './PlayerAreaStyle';
import Pile from './Pile.jsx';
// import { observe } from '../../lib/game';
import { CardPile } from '../../lib/cardpile';
const { POST, BLITZ, WOOD } = PILE_TYPES;

const distributeCards = (deck) => {
  const postPiles = [];
  const blitz = new CardPile(BLITZ);

  for (let i = 0; i < 5; i++) {
    if (!postPiles[i]) postPiles[i] = new CardPile(POST);
    const card = deck.cards.shift();
    card.flip();
    postPiles[i].dropCard(card);
  }

  for (let i = 0; i < 10; i++) {
    const card = deck.cards.shift();
    card.flip();
    blitz.dropCard(card);
  }

  const wood = new CardPile(WOOD, _.map(deck.cards));

  return {
    post: postPiles,
    blitz: blitz,
    wood: wood,
  };
};

const PlayerArea = (props) => {
  const { post, blitz, wood } = distributeCards(props.deck);
  return (
    <TwoPlayerContainer player={props.player}>
      <Wrapper>
        <Pile player={props.player} type={WOOD} cardPile={wood}></Pile>
        <Pile player={props.player} type={POST} cardPile={post[0]}></Pile>
        <Pile player={props.player} type={POST} cardPile={post[1]}></Pile>
        <Pile player={props.player} type={POST} cardPile={post[2]}></Pile>
        <Pile player={props.player} type={POST} cardPile={post[3]}></Pile>
        <Pile player={props.player} type={POST} cardPile={post[4]}></Pile>
        <Pile player={props.player} type={BLITZ} cardPile={blitz}></Pile>
      </Wrapper>
    </TwoPlayerContainer>
  );
};

export default PlayerArea;
