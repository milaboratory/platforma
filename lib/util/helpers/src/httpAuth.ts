/* TODO: replace atob/btoa with Uint8Array.toBase64/fromBase64 in the future */

export function parseHttpAuth(input: string): HttpAuth {
  const match = input.match(/(?<scheme>.*?) (?<parameters>.*)/);
  if (match?.groups?.scheme === 'Basic') {
    const credentialsMatch = atob(match.groups.credentials)
      .match(/(?<username>.*?):(?<password>.*)/);
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
  assertNever(input.scheme);
  throw new Error(`Unsupported auth scheme`); // calm down the linter
}

export type HttpAuth = BasicHttpAuth;

export interface BasicHttpAuth {
  scheme: 'Basic';
  username: string;
  password: string;
}

function assertNever(x: never) {
  throw new Error(`assertNever(${JSON.stringify(x)}) call`);
}
