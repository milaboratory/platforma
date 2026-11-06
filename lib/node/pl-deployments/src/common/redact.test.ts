import { describe, test, expect } from "vitest";
import { REDACTED, redactSecrets, stringifyRedacted } from "./redact";

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
