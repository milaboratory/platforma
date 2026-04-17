export const moveElements = <T>(array: readonly T[], from: number, to: number): T[] => {
  const result = [...array];
  if (to >= 0 && to < result.length) {
    const [element] = result.splice(from, 1);
    result.splice(to, 0, element);
  } else {
    console.warn(
      `Invalid move operation: from ${from} to ${to} in array of length ${result.length}`,
    );
  }

  return result;
};
