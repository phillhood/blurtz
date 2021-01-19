import React from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Wrapper } from './GameStyle';
import { Deck } from './../../lib/deck';
import PlayerArea from './PlayerArea.jsx';
import ScoreArea from './ScoreArea.jsx';

const deck1 = new Deck(); // get Player Deck
const deck2 = new Deck(); // get Opponnent Deck

const Game = ({ onRightClickBoard }) => {
  return (
    <DndProvider backend={HTML5Backend}>
      <Wrapper onContextMenu={onRightClickBoard}>
        <PlayerArea player={2} deck={deck2}></PlayerArea>
        <ScoreArea />
        <PlayerArea player={1} deck={deck1}></PlayerArea>
      </Wrapper>
    </DndProvider>
  );
};

export default Game;
