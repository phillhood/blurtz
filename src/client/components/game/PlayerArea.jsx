import React from 'react';
import { PILE_TYPES } from '../../constants';
import { Wrapper, TwoPlayerContainer } from './PlayerAreaStyle';
import Pile from './Pile.jsx';

const { WOOD, BLITZ, DISCARD } = PILE_TYPES;

const generateWoodPiles = (player, pileCount) => {
  const piles = [];
  for (let i = 0; i < pileCount; i++) {
    piles.push(<Pile type={WOOD} key={`${player}-${WOOD}-${i}`} />);
  }
  return piles;
};

const PlayerArea = (props) => {
  const woodPiles = generateWoodPiles(props.player, 5);
  return (
    <TwoPlayerContainer player={props.player}>
      <Wrapper>
        <Pile type={DISCARD}></Pile>
        {woodPiles}
        <Pile type={BLITZ}></Pile>
      </Wrapper>
    </TwoPlayerContainer>
  );
};

export default PlayerArea;
