/** A tool call result as the MCP client returns it. */
type ToolCallResult = { content?: { type: string; text?: string }[]; isError?: boolean };

function firstText(result: unknown): string {
  const text = (result as ToolCallResult).content?.[0]?.text;
  if (text === undefined) throw new Error("No text content in the tool result");
  return text;
}

/**
 * Reads the JSON value a tool returned.
 *
 * @throws when the tool returned an error, with the error text
 */
export function parseResult(result: unknown): unknown {
  const text = firstText(result);
  if ((result as ToolCallResult).isError === true)
    throw new Error(`Tool returned an error: ${text}`);
  return JSON.parse(text);
}

/**
 * Reads the message of an error a tool returned.
 *
 * @throws when the tool succeeded
 */
export function expectToolError(result: unknown): string {
  const text = firstText(result);
  if ((result as ToolCallResult).isError !== true)
    throw new Error(`Expected the tool to return an error, got: ${text}`);
  return text;
}
