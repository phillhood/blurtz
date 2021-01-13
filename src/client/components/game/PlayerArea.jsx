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

const distributeCards = (deck) => {
  const wood = [];
  const blitz = [];
  let discard = [];

  for (let i = 0; i < 5; i++) {
    if (!wood[i]) wood[i] = [];
    const card = deck.cards.shift();
    card.flip();
    wood[i].push(card);
  }

  for (let i = 0; i < 10; i++) {
    const card = deck.cards.shift();
    card.flip();
    blitz.push(card);
  }

  discard = _.map(deck.cards);
  for (let i = 1; i < 4; i++) {
    const index = discard.length - i;
    discard[index].flip();
  }

  return {
    wood: wood,
    blitz: blitz,
    discard: discard,
  };
};

const PlayerArea = (props) => {
  const { wood, blitz, discard } = distributeCards(props.deck);
  return (
    <TwoPlayerContainer player={props.player}>
      <Wrapper>
        <Pile type={DISCARD} cards={discard}></Pile>
        <Pile type={WOOD} cards={wood[0]}></Pile>
        <Pile type={WOOD} cards={wood[1]}></Pile>
        <Pile type={WOOD} cards={wood[2]}></Pile>
        <Pile type={WOOD} cards={wood[3]}></Pile>
        <Pile type={WOOD} cards={wood[4]}></Pile>
        <Pile type={BLITZ} cards={blitz}></Pile>
      </Wrapper>
    </TwoPlayerContainer>
  );
};

export default PlayerArea;
