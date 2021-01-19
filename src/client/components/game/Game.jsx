import React from 'react';
import _ from 'lodash';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Wrapper } from './GameStyle';
import { Deck } from './../../lib/deck';
import { CardPile } from './../../lib/cardpile';
import PlayerArea from './PlayerArea.jsx';
import ScoreArea from './ScoreArea.jsx';
import { PILE_TYPES } from '../../lib/constants';

const { WOOD, BLITZ, POST } = PILE_TYPES;

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

const mockData = {
  players: [
    {
      id: '1',
      deck: distributeCards(new Deck()),
    },
    {
      id: '2',
      deck: distributeCards(new Deck()),
    },
  ],
};

const Game = ({ data }) => {
  const [p1, p2] = mockData.players;
  return (
    <DndProvider backend={HTML5Backend}>
      <Wrapper>
        <PlayerArea player={p2.id} deck={p2.deck}></PlayerArea>
        <ScoreArea />
        <PlayerArea player={p1.id} deck={p1.deck}></PlayerArea>
      </Wrapper>
    </DndProvider>
  );
};

export default Game;
