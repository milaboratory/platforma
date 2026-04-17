export const logDebug = (msg: string, ...rest: unknown[]) => {
  console.log(
    `%c>>> %c${msg}`,
    "color: orange; font-weight: bold",
    "color: orange",
    ...rest.map((r) => stringifyForDebug(r)),
  );
};

export const logError = (msg: string, ...rest: unknown[]) => {
  console.error(
    `%c>>> %c${msg}`,
    "color: red; font-weight: bold",
    "color: red",
    ...rest.map((r) => stringifyForDebug(r)),
  );
};

const stringifyForDebug = (v: unknown) => {
  try {
    return JSON.stringify(v, null, 2);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
};
