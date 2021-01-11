import React, { Component } from 'react';
import './app.css';
import { Wrapper, Title } from './AppStyle';
import { GameContainer } from './containers';

export default class App extends Component {
  render() {
    return (
      <Wrapper>
        <Title>
          <span>NederBlutz!</span>
        </Title>
        <GameContainer />
      </Wrapper>
    );
  }
}
