const adjectives = [
  "happy",
  "clever",
  "brave",
  "swift",
  "bright",
  "calm",
  "bold",
  "cool",
  "fast",
  "wise",
  "kind",
  "wild",
  "free",
  "pure",
  "warm",
  "quick",
  "smart",
  "strong",
  "gentle",
  "fierce",
  "proud",
  "silent",
  "magic",
  "golden",
  "silver",
  "crystal",
  "mystic",
  "royal",
  "ancient",
  "noble",
];

const colors = [
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "orange",
  "pink",
  "black",
  "white",
  "gray",
  "brown",
  "violet",
  "indigo",
  "cyan",
  "lime",
  "navy",
  "teal",
  "olive",
  "maroon",
  "aqua",
  "coral",
  "crimson",
  "azure",
  "amber",
];

const animals = [
  "cat",
  "dog",
  "fox",
  "wolf",
  "bear",
  "lion",
  "tiger",
  "eagle",
  "hawk",
  "owl",
  "deer",
  "rabbit",
  "horse",
  "dolphin",
  "whale",
  "shark",
  "falcon",
  "raven",
  "swan",
  "panda",
  "koala",
  "lemur",
  "gecko",
  "lynx",
  "otter",
  "seal",
  "moose",
  "bison",
  "cobra",
  "viper",
  "dragon",
  "phoenix",
];

const longestIn = (words: string[]): number =>
  words.reduce((longest, word) => Math.max(longest, word.length), 0);

/**
 * The longest code the generators below can mint: three words, two separators,
 * and the fallback's "-100". Derived from the word lists rather than written
 * down, so a longer word cannot leave the join route refusing a code this
 * server itself issued.
 */
export const MAX_ALIAS_LENGTH =
  longestIn(adjectives) + longestIn(colors) + longestIn(animals) + "--".length + "-100".length;

export const generateAlias = (): string => {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];

  return `${adjective}-${color}-${animal}`;
};

export const generateAliasWithNumber = (): string => {
  const alias = generateAlias();
  const number = Math.floor(Math.random() * 100) + 1;
  return `${alias}-${number}`;
};
