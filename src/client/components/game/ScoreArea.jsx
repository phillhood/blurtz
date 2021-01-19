import React from 'react';
import { ScoreAreaContainer } from './ScoreAreaStyle';
import { PILE_TYPES } from '../../lib/constants';
import Pile from './Pile.jsx';
import { CardPile } from '../../lib/cardpile';

const { DUTCH } = PILE_TYPES;

const generateDutchPiles = (piles) => {
  const dutchPiles = [];
  for (let i = 0; i < piles; i++) {
    dutchPiles.push(
      <Pile
        type={DUTCH}
        key={`${DUTCH}-${i}`}
        cardPile={new CardPile(DUTCH)}
      ></Pile>
    );
  }
  return dutchPiles;
};

const ScoreArea = () => {
  const numPiles = 8;
  const piles = generateDutchPiles(numPiles);
  return <ScoreAreaContainer>{piles}</ScoreAreaContainer>;
};

export default ScoreArea;
