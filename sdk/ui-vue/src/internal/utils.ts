export function logDebug(msg: string, ...rest: unknown[]) {
  console.log(
    `%c>>> %c${msg}`,
    "color: orange; font-weight: bold",
    "color: orange",
    ...rest.map((r) => stringifyForDebug(r)),
  );
}

export function logError(msg: string, ...rest: unknown[]) {
  console.error(
    `%c>>> %c${msg}`,
    "color: red; font-weight: bold",
    "color: red",
    ...rest.map((r) => stringifyForDebug(r)),
  );
}

function stringifyForDebug(v: unknown) {
  try {
    return JSON.stringify(v, null, 2);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
