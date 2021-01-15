export class CardPile {
  constructor(cards = []) {
    this.cards = cards;
    this._updateCards();
    this._setLast();
  }

  _updateCards() {
    this.faceDown = this.cards.filter((card) => {
      return !card.faceUp;
    });
    this.faceUp = this.cards.filter((card) => {
      return card.faceUp;
    });
  }

  _setLast() {
    this.last = this.cards[this.cards.length - 1];
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
    const card = this.cards.pop();
    this._setLast();
    this._updateCards();
    return card;
  }
}
