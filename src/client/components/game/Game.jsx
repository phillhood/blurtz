import React from 'react';
// import { CellContainer } from '../../containers';
import { Wrapper, Container } from './GameStyle';
// import { Deck } from './../../lib/deck';
import PlayerArea from './PlayerArea.jsx';
import ScoreArea from './ScoreArea.jsx';

const Game = ({ onRightClickBoard }) => {
  return (
    <Wrapper onContextMenu={onRightClickBoard}>
      <Container>
        <PlayerArea player={2}></PlayerArea>
        <ScoreArea></ScoreArea>
        <PlayerArea player={1}></PlayerArea>
      </Container>
    </Wrapper>
  );
};

export default Game;
