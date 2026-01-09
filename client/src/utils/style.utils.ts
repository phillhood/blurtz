export const getOpponentScale = (count: number): number => {
  switch (count) {
    case 1:
      return 0.7;
    case 2:
      return 0.6;
    case 3:
      return 0.5;
    default:
      return 0.5;
  }
};

export const getOpponentMaxWidth = (count: number): string => {
  switch (count) {
    case 1:
      return "100%";
    case 2:
      return "350px";
    case 3:
      return "300px";
    default:
      return "280px";
  }
};
