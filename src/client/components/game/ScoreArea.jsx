import React from 'react';
import { ScoreAreaContainer } from './ScoreAreaStyle';
import { PILE_TYPES } from '../../constants';
import Pile from './Pile.jsx';

const { DUTCH } = PILE_TYPES;

const generateDutchPiles = () => {
  const dutchPiles = [];
  for (let i = 0; i < 8; i++) {
    dutchPiles.push(<Pile type={DUTCH} key={`${DUTCH}-${i}`}></Pile>);
  }
  return dutchPiles;
};

const ScoreArea = () => {
  return <ScoreAreaContainer>{generateDutchPiles()}</ScoreAreaContainer>;
};

export default ScoreArea;
