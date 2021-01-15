export class CardPile {
  constructor(cards = []) {
    this.cards = cards;
    this._setLast();
  }

  _setLast() {
    this.last = this.cards[this.cards.length - 1];
  }

  dropCard(card) {
    this.cards.push(card);
    this._setLast();
  }
  readTopCard() {
    return this.last;
  }
  pickCard() {
    const card = this.cards.pop();
    this._setLast();
    return card;
  }
}
