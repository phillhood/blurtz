import _ from 'lodash';
import { PILE_TYPES } from '../constants';

const { WOOD } = PILE_TYPES;

export class CardPile {
  constructor(type, cards = []) {
    this.type = type || 'DEFAULT';
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

  _setLast() {
    this.last = this.cards[this.cards.length - 1];
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
    this._setLast();
    this._updateCards();
  }
  readTopCard() {
    return this.last;
  }
  pickCard() {
    const card = this.faceUp.pop();
    _.remove(this.cards, card);
    this._updateCards();
    return card;
  }
}
