export function isDisposable(object: unknown): object is Disposable {
  return (
    typeof object === "object" &&
    object !== null &&
    Symbol.dispose in object &&
    typeof object[Symbol.dispose] === "function"
  );
}

export function isAsyncDisposable(object: unknown): object is AsyncDisposable {
  return (
    typeof object === "object" &&
    object !== null &&
    Symbol.asyncDispose in object &&
    typeof object[Symbol.asyncDispose] === "function"
  );
}
