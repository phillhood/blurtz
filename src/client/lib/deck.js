import _ from 'lodash';
import { COLOURS, CARD_VALUES } from './../constants';

export class Deck {
  constructor(cards = generateDeck()) {
    this.cards = cards;
    this.shuffle();
  }

  get numberOfCards() {
    return this.cards.length;
  }

  shuffle() {
    for (let i = this.numberOfCards - 1; i > 0; i--) {
      const randomIndex = Math.floor(Math.random() * (i + 1));
      const swapSource = this.cards[randomIndex];
      this.cards[randomIndex] = this.cards[i];
      this.cards[i] = swapSource;
    }
  }
}

class Card {
  constructor(colour, value) {
    this.colour = colour;
    this.value = value;
    this.faceUp = false;
  }

  flip() {
    this.faceUp = !this.faceUp;
  }
}

function generateDeck() {
  return _.flatMap(COLOURS, (colour) => {
    return _.map(CARD_VALUES, (value) => {
      return new Card(colour, value);
    });
  });
}
