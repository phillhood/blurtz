import React, { useEffect, useState } from 'react';
import socketIOClient from 'socket.io-client';
import { Wrapper, Title } from './AppStyle';
import { GameContainer } from './containers';
import { SettingsContainer } from './containers';

const ENDPOINT = 'http://localhost:8080';

console.log(ENDPOINT);

const gameState = {};

function App() {
  // const [gameState, setGameState] = useState({});
  useEffect(() => {
    console.log('socket');
    const socket = socketIOClient(ENDPOINT);
    socket.on('connection', (data) => {
      console.log('connection from client');
      // setGameState(data);
    });
  });
  return (
    <Wrapper>
      <Title>
        <span>NederBlutz!</span>
      </Title>
      <GameContainer data={gameState} />
      <SettingsContainer />
    </Wrapper>
  );
}

export default App;
