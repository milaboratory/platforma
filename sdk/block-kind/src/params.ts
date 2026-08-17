/**
 * Establish that a value is an object of this kind's declared params, and carries nothing
 * else — the half of a params check every kind needs and no two kinds differ on.
 *
 * Params that arrived from a template file are `unknown`, and before a single field can be
 * read the value has to be an object whose keys are keys this kind declares. What each field
 * must *be* is the kind's own business and stays in the kind, as plain TypeScript: this
 * package deliberately carries no validation library, so a kind author owes it no schema.
 *
 * Refusing an undeclared key is the point rather than a nicety. A file saying `number:` where
 * the kind declares `numbers:` would otherwise pass every check — the key is ignored, the
 * block initializes blank, and the first complaint arrives much later from the block itself,
 * naming nothing about the typo. Here the entry is refused and the key is named.
 *
 * An assertion rather than a parser that returns a copy, so a kind reads its fields off the
 * value it was handed, and a kind whose contract is empty needs nothing but this line:
 *
 * ```ts
 * function parseInitializationParams(value: unknown): BlockParams {
 *   assertDeclaredParams(value, ["numbers"]);
 *
 *   const { numbers } = value;
 *   if (numbers !== undefined && !isNumberArray(numbers)) {
 *     throw new Error("'numbers' must be an array of numbers.");
 *   }
 *   return { numbers };
 * }
 * ```
 *
 * Messages are finished sentences addressed to whoever wrote the file, because that is who
 * reads them: a kind's rejection is reported against the entry that carried the params.
 *
 * @param value The params as they arrived
 * @param declaredKeys Every key this kind's params may carry. Empty for a kind that takes
 *   none, which is then a contract that rejects everything but `{}`
 * @throws if `value` is not an object, or carries a key `declaredKeys` does not list
 */
export function assertDeclaredParams(
  value: unknown,
  declaredKeys: readonly string[],
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Params must be an object, not ${describe(value)}.`);
  }

  const undeclared = Object.keys(value).filter((key) => !declaredKeys.includes(key));
  if (undeclared.length === 0) return;

  // The two cases read differently to the person holding the file. With a contract to
  // compare against, the useful half is what the kind does declare — that is where the
  // misspelling they made is visible. With no contract at all there is nothing to compare
  // to, and listing an empty set would only puzzle them.
  throw new Error(
    declaredKeys.length === 0
      ? `This block takes no params, but ${list(undeclared)} ${was(undeclared)} set.`
      : `Params carry ${list(undeclared)}, which this block does not declare. ` +
          `It takes ${list(declaredKeys)}.`,
  );
}

/** What a value is, for a message that has to say why it is not an object. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "nothing";
  if (Array.isArray(value)) return "an array";
  // The value itself, not just its type: `"{}"` arriving as a string rather than an object is
  // a quoting mistake in the file, and only seeing it printed makes that obvious.
  return `a ${typeof value} (${JSON.stringify(value) ?? String(value)})`;
}

function list(keys: readonly string[]): string {
  return keys.map((key) => `'${key}'`).join(", ");
}

function was(keys: readonly string[]): string {
  return keys.length === 1 ? "was" : "were";
}
