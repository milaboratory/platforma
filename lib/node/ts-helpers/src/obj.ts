export function deepFreeze<T extends object>(object: T): T {
  if (typeof object !== "object" || object === null) return object;
  const propNames = Reflect.ownKeys(object);
  for (const name of propNames) {
    const value = object[name as keyof T];
    if (
      value &&
      ((typeof value === "object" &&
        (Object.getPrototypeOf(value) === Object.prototype ||
          Object.getPrototypeOf(value) === null)) ||
        typeof value === "function")
    ) {
      deepFreeze(value);
    }
  }
  return Object.freeze(object);
}

export function isObject(test: unknown): test is object {
  return typeof test === "object" && test !== null;
}
