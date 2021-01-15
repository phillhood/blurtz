export class Card {
  constructor(colour, value) {
    this.colour = colour;
    this.value = value;
    this.faceUp = false;
  }

  flip() {
    this.faceUp = !this.faceUp;
  }
}
