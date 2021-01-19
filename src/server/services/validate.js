import { PILE_TYPES } from './constants';

const { BLITZ } = PILE_TYPES;

export const allowPostDrop = (pile, card) => {
  if (!pile.faceUp.length) {
    if (card.type === BLITZ) {
      return true;
    } else {
      return false;
    }
  }
  const pileCard = pile.faceUp[pile.faceUp.length - 1];
  if (pileCard.colour.type !== card.colour.type) {
    if (card.value === pileCard.value - 1) {
      return true;
    }
  }
  return false;
};

export const allowDutchDrop = (pile, card) => {
  if (!pile.faceUp.length) {
    if (card.value === 1) {
      return true;
    } else {
      return false;
    }
  }
  const pileCard = pile.faceUp[pile.faceUp.length - 1];
  if (pileCard.colour.name === card.colour.name) {
    if (card.value === pileCard.value + 1) {
      return true;
    }
  }
  return false;
};
