import React from 'react';
import { Wood, Blitz, Discard, Dutch } from './PileStyle';
import { PILE_TYPES } from '../../constants';

const { WOOD, BLITZ, DISCARD, DUTCH } = PILE_TYPES;

const generatePile = (type) => {
  switch (type) {
    case WOOD:
      return <Wood></Wood>;
    case BLITZ:
      return <Blitz></Blitz>;
    case DISCARD:
      return <Discard></Discard>;
    case DUTCH:
      return <Dutch></Dutch>;
  }
};

const Pile = (props) => {
  const type = props.type;
  return generatePile(type);
};

export default Pile;
