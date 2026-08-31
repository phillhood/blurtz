import {
  CARD_COLORS,
  createBankPiles,
  type Card,
  type Pile,
  type PlayerDeck,
} from "@blurtz/shared";

export type StepKind = "say" | "do";

export interface RequiredMove {
  cardId: string;
  fromPileId: string;
  toPileId: string;
}

export interface TutorialStep {
  id: string;
  kind: StepKind;
  title: string;
  say: string;
  instruction?: string;
  /**
   * The move this step will accept, resolved against live state rather than
   * fixed ids - every earlier step has already changed the board.
   * Returns null when the move is no longer available.
   */
  requires?: (deck: PlayerDeck, bankPiles: Pile[]) => RequiredMove | null;
}

export const BLURTZ_PILE_ID = "tut-blurtz";
export const DRAW_PILE_ID = "tut-draw";
export const workPileId = (index: number) => `tut-work-${index}`;

type ColorKey = keyof typeof CARD_COLORS;

const card = (value: number, color: ColorKey, faceUp: boolean): Card => ({
  id: `tut-${CARD_COLORS[color].name.toLowerCase()}-${value}`,
  value,
  color: CARD_COLORS[color],
  faceUp,
});

const DEALT: Array<[number, ColorKey]> = [
  [4, "GREEN"],
  [2, "RED"],
  [1, "RED"],
  [7, "YELLOW"],
  [6, "RED"],
  [7, "GREEN"],
  [2, "GREEN"],
  [5, "GREEN"],
];

const remainingCards = (): Card[] => {
  const dealt = new Set(DEALT.map(([value, color]) => `${value}${color}`));
  const rest: Card[] = [];
  (Object.keys(CARD_COLORS) as ColorKey[]).forEach((color) => {
    for (let value = 1; value <= 10; value++) {
      if (!dealt.has(`${value}${color}`)) {
        rest.push(card(value, color, false));
      }
    }
  });
  return rest;
};

/**
 * The tutorial's board. Hand-authored rather than shuffled, so every step is
 * designed around the cards it needs.
 *
 * The Blurtz pile holds THREE cards, not the real game's ten, so the lesson can
 * end by actually calling Blurtz. Step one says so out loud.
 */
export function dealTutorial(): { deck: PlayerDeck; bankPiles: Pile[] } {
  const deck: PlayerDeck = {
    blurtzPile: {
      id: BLURTZ_PILE_ID,
      type: "blurtz",
      cards: [card(4, "GREEN", false), card(2, "RED", false), card(1, "RED", true)],
    },
    workPiles: [
      { id: workPileId(0), type: "work", cards: [card(7, "YELLOW", true)] },
      { id: workPileId(1), type: "work", cards: [card(6, "RED", true)] },
      { id: workPileId(2), type: "work", cards: [card(7, "GREEN", true)] },
      { id: workPileId(3), type: "work", cards: [card(2, "GREEN", true)] },
      { id: workPileId(4), type: "work", cards: [card(5, "GREEN", true)] },
    ],
    drawPile: { id: DRAW_PILE_ID, type: "draw", cards: remainingCards() },
  };

  return { deck, bankPiles: createBankPiles() };
}

const topOf = (pile: Pile): Card | undefined => pile.cards[pile.cards.length - 1];

const blurtzTop = (deck: PlayerDeck) => topOf(deck.blurtzPile);

const workPileToppedBy = (deck: PlayerDeck, value: number, colorName: string) =>
  deck.workPiles.find((pile) => {
    const top = topOf(pile);
    return top?.value === value && top?.color.name === colorName;
  });

const cardInWorkPiles = (deck: PlayerDeck, value: number, colorName: string) => {
  for (const pile of deck.workPiles) {
    const found = pile.cards.find(
      (candidate) => candidate.value === value && candidate.color.name === colorName
    );
    if (found) {
      return { pile, card: found };
    }
  }
  return null;
};

const firstEmptyBank = (bankPiles: Pile[]) =>
  bankPiles.find((pile) => pile.cards.length === 0);

const bankToppedBy = (bankPiles: Pile[], value: number, colorName: string) =>
  bankPiles.find((pile) => {
    const top = topOf(pile);
    return top?.value === value && top?.color.name === colorName;
  });

const firstEmptyWork = (deck: PlayerDeck) =>
  deck.workPiles.find((pile) => pile.cards.length === 0);

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "goal",
    kind: "say",
    title: "The whole game",
    say:
      "This is your Blurtz pile. Empty it and you end the round for everybody — that is what " +
      "calling Blurtz means. A real game deals ten cards here; we have given you three, so this " +
      "takes a minute instead of an evening.",
  },
  {
    id: "bank-one",
    kind: "do",
    title: "The bank starts at one",
    say:
      "The slots in the middle are bank piles, and they are shared with everyone at the table. " +
      "Every one of them starts with a 1, and the top card of your Blurtz pile is always live.",
    instruction: "Play the red 1 from your Blurtz pile to an empty bank pile",
    requires: (deck, bankPiles) => {
      const top = blurtzTop(deck);
      const target = firstEmptyBank(bankPiles);
      if (!top || !target) {
        return null;
      }
      return { cardId: top.id, fromPileId: BLURTZ_PILE_ID, toPileId: target.id };
    },
  },
  {
    id: "bank-two",
    kind: "do",
    title: "Bank piles climb",
    say:
      "A bank pile goes 1, 2, 3 and up, all in one colour. That is how cards leave your hands for " +
      "good, and every card you bank is a point.",
    instruction: "Play the red 2 onto the red 1",
    requires: (deck, bankPiles) => {
      const top = blurtzTop(deck);
      const target = bankToppedBy(bankPiles, 1, "Red");
      if (!top || !target) {
        return null;
      }
      return { cardId: top.id, fromPileId: BLURTZ_PILE_ID, toPileId: target.id };
    },
  },
  {
    id: "work-descend",
    kind: "do",
    title: "Work piles come down",
    say:
      "The piles in front of you are your staging ground. They descend by one, and the colour " +
      "family has to alternate: red and blue are one family, yellow and green the other. You get " +
      "five of them at a two-player table, four at three, three at four — the fuller the table, the " +
      "less room you have.",
    instruction: "Put the green 5 on the red 6",
    requires: (deck) => {
      const source = cardInWorkPiles(deck, 5, "Green");
      const target = workPileToppedBy(deck, 6, "Red");
      if (!source || !target) {
        return null;
      }
      return {
        cardId: source.card.id,
        fromPileId: source.pile.id,
        toPileId: target.id,
      };
    },
  },
  {
    id: "work-stack",
    kind: "do",
    title: "The stack comes with it",
    say:
      "Move a card that has others sitting on it and they all travel together. That is how you dig " +
      "for the card you actually want.",
    instruction: "Move the red 6 onto the green 7 — the green 5 rides along",
    requires: (deck) => {
      const source = cardInWorkPiles(deck, 6, "Red");
      const target = workPileToppedBy(deck, 7, "Green");
      if (!source || !target) {
        return null;
      }
      return {
        cardId: source.card.id,
        fromPileId: source.pile.id,
        toPileId: target.id,
      };
    },
  },
  {
    id: "work-empty",
    kind: "do",
    title: "An empty pile takes anything",
    say:
      "That yellow 7 has nowhere legal to go — nothing on the board is an 8 of the other colour " +
      "family. Except an empty work pile, which accepts any card at all. It is the most valuable " +
      "space you can have.",
    instruction: "Move the yellow 7 onto an empty work pile",
    requires: (deck) => {
      const source = cardInWorkPiles(deck, 7, "Yellow");
      const target = firstEmptyWork(deck);
      if (!source || !target) {
        return null;
      }
      return {
        cardId: source.card.id,
        fromPileId: source.pile.id,
        toPileId: target.id,
      };
    },
  },
  {
    id: "draw",
    kind: "do",
    title: "When you are stuck, dig",
    say:
      "Out of moves? Flip your draw pile. It turns three at a time and only the last one turned is " +
      "playable — so the card you need might be one flip away, or nine.",
    instruction: "Flip your draw pile",
  },
  {
    id: "blurtz",
    kind: "do",
    title: "Call it",
    say:
      "Last card. Put it down and call Blurtz. You score one point per card you banked, minus two " +
      "for every card still stranded on your Blurtz pile — and in a real game everyone else was " +
      "racing you for those same bank piles the entire time.",
    instruction: "Play your last Blurtz card, then call Blurtz",
    requires: (deck) => {
      const top = blurtzTop(deck);
      const target = firstEmptyWork(deck);
      if (!top || !target) {
        return null;
      }
      return { cardId: top.id, fromPileId: BLURTZ_PILE_ID, toPileId: target.id };
    },
  },
];
