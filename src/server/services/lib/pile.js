import _ from 'lodash';
import { PILE_TYPES } from './constants.js';

const { WOOD } = PILE_TYPES;
const DEFAULT = 'DEFAULT';

export class Pile {
  constructor(type, cards = []) {
    this.type = type || DEFAULT;
    this.cards = cards;
    this.faceUp = [];
    this.faceDown = [];
    this._updateCards();
    this._setLast();
  }

  _updateCards() {
    let cardsCopy = this.cards.slice();
    if (this.type === WOOD) {
      cardsCopy.reverse();
    }
    this.faceUp = _.filter(cardsCopy, (card) => {
      return card.faceUp;
    });
    this.faceDown = _.reject(this.cards, (card) => {
      return card.faceUp;
    });
  }

  flipCard(index) {
    this.cards[index].flip();
    this._updateCards();
  }

  flipPile() {
    for (let card of this.faceUp) {
      card.flip();
    }
    this._updateCards();
  }

  dropCard(card) {
    this.cards.push(card);
    this._updateCards();
  }

  pickCard() {
    const card = this.faceUp.pop();
    _.remove(this.cards, card);
    this._updateCards();
    return card;
  }
}
