import React, { Component } from 'react';
import './app.css';
import { Wrapper, Title } from './AppStyle';
import { GameContainer } from './containers';

export default class App extends Component {
  componentDidMount() {
    // fetch('/api/getUsername')
    //   .then(res => res.json())
    //   .then(user => this.setState({ username: user.username }));
  }

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
