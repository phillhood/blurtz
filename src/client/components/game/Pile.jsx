import React from 'react';
import { useDrop } from 'react-dnd';
import { SinglePile } from './PileStyle';
import Card from './Card.jsx';
import { PILE_TYPES } from '../../constants';

const { WOOD, DISCARD, BLITZ } = PILE_TYPES;

const dealCards = (type, cards) => {
  if (!cards.length) return <div></div>;
  const dealtCards = [];
  if (type === DISCARD) {
    for (let i = 1; i < 4; i++) {
      const card = cards.shift();
      dealtCards.push(
        <Card
          key={`${type}-${i}`}
          stack={i}
          colour={card.colour}
          value={card.value}
          faceUp={true}
          type={type}
        ></Card>
      );
    }
  } else {
    const card = cards.shift();
    dealtCards.push(
      <Card
        key={`${type}-${card.value}`}
        colour={card.colour}
        value={card.value}
        faceUp={true}
        type={type}
      ></Card>
    );
  }
  return dealtCards;
};

const Pile = (props) => {
  const [{ isOver }, drop] = useDrop({
    accept: [WOOD, DISCARD, BLITZ],
    drop: () => {},
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });
  return (
    <div>
      <SinglePile
        ref={drop}
        key={`${props.type}-PILE`}
        type={props.type}
        cards={props.cards}
      >
        {dealCards(props.type, props.cards)}
      </SinglePile>
      {isOver && (
        <div
          style={{
            position: 'relative',
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            height: '100%',
            width: '100%',
            zIndex: 1,
            opacity: 0.5,
            backgroundColor: 'yellow',
          }}
        />
      )}
    </div>
  );
};

export default Pile;
