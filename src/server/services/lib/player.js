export default class Player {
  constructor(id) {
    this.id = id;
    this.deck = {
      post: [],
      blitz: null,
      wood: null,
    };
  }
  setDeck(deck) {
    this.deck = deck;
  }
}
