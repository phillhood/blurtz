import React from 'react';
import { useDrop } from 'react-dnd';
import { ScoreAreaContainer } from './ScoreAreaStyle';
import { PILE_TYPES } from '../../constants';
import Pile from './Pile.jsx';

const { WOOD, DISCARD, DUTCH, BLITZ } = PILE_TYPES;

const generateDutchPiles = (piles = 0) => {
  const dutchPiles = [];
  for (let i = 0; i < piles; i++) {
    dutchPiles.push(<Pile type={DUTCH} key={`${DUTCH}-${i}`}></Pile>);
  }
  return dutchPiles;
};

const ScoreArea = () => {
  const [collectedProps, drop] = useDrop({
    accept: [WOOD, DISCARD, BLITZ],
    drop: (item, monitor) => ({}),
  });
  return <ScoreAreaContainer>{generateDutchPiles()}</ScoreAreaContainer>;
};

export default ScoreArea;
