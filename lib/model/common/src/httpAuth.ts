/* TODO: replace atob/btoa with Uint8Array.toBase64/fromBase64 in the future */

export function parseHttpAuth(input: string): HttpAuth {
  const match = /(?<scheme>.*?) (?<parameters>.*)/.exec(input);
  if (match?.groups?.scheme === 'Basic') {
    const credentialsMatch = /(?<username>.*?):(?<password>.*)/
      .exec(atob(match.groups.parameters))
    if (!credentialsMatch?.groups) {
      throw new Error(`Malformed credentials.`);
    }
    return {
      scheme: 'Basic',
      username: credentialsMatch.groups.username,
      password: credentialsMatch.groups.password,
    };
  }
  throw new Error(`Unsupported auth scheme: ${match?.groups?.scheme}.`);
}

export function serializeHttpAuth(input: HttpAuth): string {
  if (input.scheme === 'Basic') {
    return `Basic ${btoa(`${input.username}:${input.password}`)}`;
  }
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  throw new Error(`Unsupported auth scheme: ${input.scheme}.`);
}

export type HttpAuth = BasicHttpAuth;

export interface BasicHttpAuth {
  scheme: 'Basic';
  username: string;
  password: string;
}
