let observers = [];
const cardPiles = [];
function emitChange() {
  observers.forEach((o) => o && o(cardPiles));
}
export function observe(o) {
  observers.push(o);
  emitChange();
  return () => {
    observers = observers.filter((t) => t !== o);
  };
}
export function canMoveCard() {
  return true;
}
export function moveCard(fromPile, toPile) {
  toPile.push(fromPile.pop());
  emitChange();
}
