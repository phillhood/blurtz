import React from 'react';
import { ScoreAreaContainer } from './ScoreAreaStyle';
import { PILE_TYPES } from '../../constants';
import Pile from './Pile.jsx';

const { DUTCH } = PILE_TYPES;

const generateDutchPiles = (piles = 0) => {
  const dutchPiles = [];
  for (let i = 0; i < piles; i++) {
    dutchPiles.push(<Pile type={DUTCH} key={`${DUTCH}-${i}`}></Pile>);
  }
  return dutchPiles;
};

const ScoreArea = () => {
  return <ScoreAreaContainer>{generateDutchPiles()}</ScoreAreaContainer>;
};

export default ScoreArea;
