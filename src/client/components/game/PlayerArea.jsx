import React from 'react';
import _ from 'lodash';
import { PILE_TYPES } from '../../lib/constants';
import { Wrapper, TwoPlayerContainer } from './PlayerAreaStyle';
import Pile from './Pile.jsx';
const { POST, BLITZ, WOOD } = PILE_TYPES;

const PlayerArea = ({ player, deck }) => {
  const { post, blitz, wood } = deck;
  return (
    <TwoPlayerContainer player={player}>
      <Wrapper>
        <Pile player={player} type={WOOD} cardPile={wood}></Pile>
        <Pile player={player} type={POST} cardPile={post[0]}></Pile>
        <Pile player={player} type={POST} cardPile={post[1]}></Pile>
        <Pile player={player} type={POST} cardPile={post[2]}></Pile>
        <Pile player={player} type={POST} cardPile={post[3]}></Pile>
        <Pile player={player} type={POST} cardPile={post[4]}></Pile>
        <Pile player={player} type={BLITZ} cardPile={blitz}></Pile>
      </Wrapper>
    </TwoPlayerContainer>
  );
};

export default PlayerArea;
