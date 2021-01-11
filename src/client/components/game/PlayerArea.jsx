import React from 'react';
import _ from 'lodash';
import { PILE_TYPES } from '../../constants';
import { Wrapper, TwoPlayerContainer } from './PlayerAreaStyle';
import Pile from './Pile.jsx';

const { WOOD, BLITZ, DISCARD } = PILE_TYPES;

// const init = (deck) => {};

// const generateWoodPiles = (player, pileCount) => {
//   const piles = [];
//   for (let i = 0; i < pileCount; i++) {
//     piles.push(<Pile type={WOOD} key={`${player}-${WOOD}-${i}`} cards={[]} />);
//   }
//   return piles;
// };

const distributeCards = (deck, woodCards, blitzCards) => {
  for (let i = 0; i < 5; i++) {
    if (!woodCards[i]) woodCards[i] = [];
    woodCards[i].push(deck.cards.shift());
  }
  for (let i = 0; i < 10; i++) {
    blitzCards.push(deck.cards.shift());
  }
  return _.map(deck.cards);
};

const PlayerArea = (props) => {
  const woodCards = [];
  const blitzCards = [];
  const discardCards = distributeCards(props.deck, woodCards, blitzCards);
  return (
    <TwoPlayerContainer player={props.player}>
      <Wrapper>
        <Pile type={DISCARD} cards={discardCards}></Pile>
        <Pile type={WOOD} cards={woodCards[0]}></Pile>
        <Pile type={WOOD} cards={woodCards[1]}></Pile>
        <Pile type={WOOD} cards={woodCards[2]}></Pile>
        <Pile type={WOOD} cards={woodCards[3]}></Pile>
        <Pile type={WOOD} cards={woodCards[4]}></Pile>
        <Pile type={BLITZ} cards={blitzCards}></Pile>
      </Wrapper>
    </TwoPlayerContainer>
  );
};

export default PlayerArea;
