import _ from 'lodash';
import { Deck } from './lib/deck.js';
import { Pile } from './lib/pile.js';
import { PILE_TYPES } from './lib/constants.js';
import GameState from './lib/gameState.js';

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

const newGame = (players) => {
  const newGame = new GameState(players);
  for (const player of newGame.players) {
    player.setDeck(distributeCards(new Deck()));
  }
  return newGame;
};

export default newGame;
