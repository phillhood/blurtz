import _ from 'lodash';
import { Deck } from './lib/deck';
import { Pile } from './lib/pile';
import { PILE_TYPES } from './lib/constants';
import GameState from './lib/gameState';

const { POST, BLITZ, WOOD } = PILE_TYPES;

const distributeCards = (deck) => {
  const postPiles = [];
  const blitz = new Pile(BLITZ);

  for (let i = 0; i < 5; i++) {
    if (!postPiles[i]) postPiles[i] = new Pile(POST);
    const card = deck.cards.shift();
    card.flip();
    postPiles[i].dropCard(card);
  }

  for (let i = 0; i < 10; i++) {
    const card = deck.cards.shift();
    card.flip();
    blitz.dropCard(card);
  }

  const wood = new Pile(WOOD, _.map(deck.cards));

  return {
    post: postPiles,
    blitz: blitz,
    wood: wood,
  };
};

export const newGame = (players) => {
  const newGame = new GameState(players);
  for (const player of newGame.players) {
    player.setDeck(distributeCards(new Deck()));
  }
  return newGame;
};
