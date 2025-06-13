export const moveElements = <T>(array: T[], from: number, to: number): T[] => {
  if (to >= 0 && to < array.length) {
    const element = array.splice(from, 1)[0];
    array.splice(to, 0, element);
  }

  return array;
};