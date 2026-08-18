/**
 * Establish that a value is an object whose fields a kind can read — the half of a params
 * check every kind needs and no two kinds differ on.
 *
 * Params that arrived from a template file are `unknown`, and before a single field can be
 * read the value has to be an object. Worth a shared function because the check is easy to
 * get wrong by hand: `typeof null` is `"object"`, `Object.keys(5)` is `[]` and
 * `Object.keys(["a"])` is `["0"]`, so a naive test lets `null`, a number and an array through
 * as if they were empty params.
 *
 * What each field must *be* is the kind's own business and stays in the kind, as plain
 * TypeScript: this package deliberately carries no validation library, so a kind author owes
 * it no schema.
 *
 * A key the kind does not declare is NOT refused. A parser returns the params to use, so a
 * field it never read is dropped and never reaches the block — the only question was whether
 * to also complain, and complaining costs more than it catches. It would mean each kind
 * restating its own field list as strings, with nothing checking that the list stayed in step
 * with the type: a field added to the contract and read by the parser, but missed in the list,
 * would turn into a kind that refuses files that are correct. What an unexpected key can
 * actually mean is a params contract from a different version of the kind, and that is
 * guarded where it belongs — by the version in the entry's `{name}@{selector}` reference.
 *
 * An assertion rather than a parser that returns a copy, so a kind reads its fields off the
 * value it was handed:
 *
 * ```ts
 * function parseInitializationParams(value: unknown): BlockParams {
 *   assertParamsObject(value);
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
 * @throws if `value` is not an object
 */
export function assertParamsObject(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Params must be an object, not ${describe(value)}.`);
  }
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
