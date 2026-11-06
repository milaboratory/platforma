import { describe, test, expect } from "vitest";
import { REDACTED, redactSecrets, redactString, stringifyRedacted } from "./redact";

describe("redactSecrets", () => {
  test("replaces values of secret keys at any depth", () => {
    const input = {
      plUser: "default-user",
      plPassword: "p1",
      plJwt: "p2",
      nested: {
        jwt: "p3",
        minioPassword: "p4",
        envs: { MINIO_ROOT_USER: "minio-user", MINIO_ROOT_PASSWORD: "p5" },
        storages: [{ key: "minio-user", secret: "p6" }],
        token: "p7",
        proxy: { url: "http://proxy", auth: "user:p8" },
      },
    };

    expect(redactSecrets(input)).toStrictEqual({
      plUser: "default-user",
      plPassword: REDACTED,
      plJwt: REDACTED,
      nested: {
        jwt: REDACTED,
        minioPassword: REDACTED,
        envs: { MINIO_ROOT_USER: "minio-user", MINIO_ROOT_PASSWORD: REDACTED },
        storages: [{ key: "minio-user", secret: REDACTED }],
        token: REDACTED,
        proxy: { url: "http://proxy", auth: REDACTED },
      },
    });
  });

  test("does not modify the input", () => {
    const input = { plPassword: "p1", nested: { jwt: "p2" } };
    redactSecrets(input);
    expect(input).toStrictEqual({ plPassword: "p1", nested: { jwt: "p2" } });
  });

  test("keeps primitives, absent secrets and non-secret keys", () => {
    expect(redactSecrets("plain")).toBe("plain");
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets(null)).toBe(null);
    expect(redactSecrets({ password: undefined, plUser: "u", ports: [1, 2] })).toStrictEqual({
      password: undefined,
      plUser: "u",
      ports: [1, 2],
    });
  });

  test("handles cycles", () => {
    const input: Record<string, unknown> = { password: "p" };
    input.self = input;
    expect(stringifyRedacted(input)).toBe(`{"password":"${REDACTED}","self":"[Circular]"}`);
  });
});

describe("redactString", () => {
  test.each([
    ["http://user:s3cret@proxy:3128", `http://user:${REDACTED}@proxy:3128`],
    ["postgres://pl:s3cret@db/pl?sslmode=off", `postgres://pl:${REDACTED}@db/pl?sslmode=off`],
    [
      "https://host/x?a=1&access_token=s3cret&b=2",
      `https://host/x?a=1&access_token=${REDACTED}&b=2`,
    ],
    ["http://host/?jwt=s3cret", `http://host/?jwt=${REDACTED}`],
    ["MINIO_ROOT_PASSWORD=s3cret", `MINIO_ROOT_PASSWORD=${REDACTED}`],
    ["run --auth-token=s3cret --port=1", `run --auth-token=${REDACTED} --port=1`],
    ['{"plPassword": "s3cret", "plUser": "u"}', `{"plPassword": "${REDACTED}", "plUser": "u"}`],
    ['"{"plPassword": s3cret}" is not valid JSON', `"{"plPassword": ${REDACTED} is not valid JSON`],
    ["Authorization: Bearer abc.def-ghi", `Authorization: Bearer ${REDACTED}`],
  ])("%s", (input, expected) => {
    expect(redactString(input)).toBe(expected);
  });

  test("leaves text without credentials alone", () => {
    const text =
      "listening on http://127.0.0.1:40521, user default-user, MINIO_ADDRESS=127.0.0.1:9000";
    expect(redactString(text)).toBe(text);
  });
});

describe("redactSecrets on strings, toJSON and references", () => {
  test("redacts inside string values, including env arrays and env records", () => {
    expect(
      redactSecrets({
        proxy: { url: "http://u:s3cret@proxy" },
        env: { HTTPS_PROXY: "http://u:s3cret@proxy", PL_TOKEN: "s3cret", HOME: "/home/u" },
        envList: ["HOME=/home/u", "MINIO_ROOT_PASSWORD=s3cret"],
      }),
    ).toStrictEqual({
      proxy: { url: `http://u:${REDACTED}@proxy` },
      env: { HTTPS_PROXY: `http://u:${REDACTED}@proxy`, PL_TOKEN: REDACTED, HOME: "/home/u" },
      envList: ["HOME=/home/u", `MINIO_ROOT_PASSWORD=${REDACTED}`],
    });
  });

  test("does not call a custom toJSON, redacts own properties instead", () => {
    const input = { nested: { user: "u", toJSON: () => ({ password: "s3cret" }) } };
    expect(stringifyRedacted(input)).toBe(`{"nested":{"user":"u"}}`);
  });

  test("survives a throwing or self-returning toJSON", () => {
    const self: Record<string, unknown> = { password: "s3cret" };
    self.me = self;
    self.toJSON = () => self;
    expect(stringifyRedacted({ self })).toBe(
      `{"self":{"password":"${REDACTED}","me":"[Circular]"}}`,
    );
    const throwing = {
      toJSON: () => {
        throw new Error("no");
      },
    };
    expect(stringifyRedacted({ throwing })).toBe('{"throwing":{}}');
  });

  test("keeps shared non-cyclic references", () => {
    const shared = { port: 1 };
    expect(redactSecrets({ a: shared, b: shared })).toStrictEqual({
      a: { port: 1 },
      b: { port: 1 },
    });
  });

  test("keeps Dates as JSON strings", () => {
    expect(stringifyRedacted({ at: new Date(0) })).toBe('{"at":"1970-01-01T00:00:00.000Z"}');
  });
});

describe("second review cases", () => {
  test.each([
    ["http://u:abc@def@proxy:3128/x", `http://u:${REDACTED}@proxy:3128/x`],
    ["https://host/x?token=abc,def&b=2#frag", `https://host/x?token=${REDACTED}&b=2#frag`],
    ['TOKEN="s3cret value" next', `TOKEN="${REDACTED}" next`],
    ["TOKEN='s3cret value' next", `TOKEN='${REDACTED}' next`],
    ['TOKEN="s3\\"cret" next', `TOKEN="${REDACTED}" next`],
    ["TOKEN=s3cret;next", `TOKEN=${REDACTED};next`],
    ['password: "s3cret value"', `password: "${REDACTED}"`],
    ["jwt: s3cret, user: u", `jwt: ${REDACTED}, user: u`],
  ])("%s", (input, expected) => {
    expect(redactString(input)).toBe(expected);
  });

  test("toJSON is never allowed to change the original", () => {
    const obj = {
      password: "s3cret",
      toJSON() {
        this.password = "changed";
        return this;
      },
    };
    const out = stringifyRedacted({ obj });
    expect(obj.password).toBe("s3cret");
    expect(out).not.toContain("s3cret");
  });

  test("a throwing toJSON getter falls back to own properties", () => {
    const obj = Object.defineProperty({ user: "u", password: "s3cret" }, "toJSON", {
      get() {
        throw new Error("getter");
      },
    });
    expect(stringifyRedacted({ obj })).toBe(`{"obj":{"user":"u","password":"${REDACTED}"}}`);
  });

  test("URL objects are serialized with user info masked", () => {
    expect(stringifyRedacted({ proxy: new URL("http://u:s3cret@proxy:3128/") })).toBe(
      `{"proxy":"http://u:${REDACTED}@proxy:3128/"}`,
    );
  });
});

describe("third review cases", () => {
  test("query values end at JSON delimiters, commas stay inside", () => {
    expect(redactString('{"url":"https://h?token=abc","status":503}')).toBe(
      `{"url":"https://h?token=${REDACTED}","status":503}`,
    );
    expect(redactString("https://h?token=abc,def")).toBe(`https://h?token=${REDACTED}`);
  });

  test("Date and URL subclasses with overridden toJSON are not called", () => {
    class SneakyDate extends Date {
      public password = "s3cret";
      override toJSON() {
        this.password = "changed";
        return this.password;
      }
    }
    class ThrowingUrl extends URL {
      override toJSON(): string {
        throw new Error("no");
      }
    }
    const date = new SneakyDate(0);
    const out = stringifyRedacted({
      date,
      url: new ThrowingUrl("http://u:s3cret@proxy/"),
    });
    expect(date.password).toBe("s3cret");
    expect(out).toBe(`{"date":"1970-01-01T00:00:00.000Z","url":"http://u:${REDACTED}@proxy/"}`);
  });

  test("an invalid Date does not throw", () => {
    expect(stringifyRedacted({ at: new Date(Number.NaN) })).toBe('{"at":"[unserializable]"}');
  });
});
