import type { Expression } from "./base";

/** Defines the supported hash types. Includes common cryptographic and non-cryptographic algorithms. */
export type HashType =
  | "sha256" // Cryptographic
  | "sha512" // Cryptographic
  | "md5" // Cryptographic (use with caution due to vulnerabilities)
  | "blake3" // Cryptographic
  | "wyhash" // Non-cryptographic
  | "xxh3"; // Non-cryptographic

/**
 * Defines the encoding for the hash output.
 * - 'hex': Standard hexadecimal encoding.
 * - 'base64': Standard base64 encoding.
 * - 'base64_alphanumeric': Base64 encoding with non-alphanumeric characters (e.g., '+', '/') removed.
 * - 'base64_alphanumeric_upper': Base64 encoding with non-alphanumeric characters removed and the result converted to uppercase.
 */
export type HashEncoding = "hex" | "base64" | "base64_alphanumeric" | "base64_alphanumeric_upper";

/** Represents a hashing operation on an expression. */
export interface HashExpression {
  /** The specific type of hash algorithm to apply. */
  type: "hash";
  /** The type of hash algorithm to apply. */
  hashType: HashType;
  /** The encoding for the output hash string. */
  encoding: HashEncoding;
  /** The expression whose value will be hashed. */
  value: Expression;
  /** Optional. Minimal number of entropy bits required. Affects encoding, truncating the result to the shortest string with the requested entropy. No error if bits exceed what the hash offers. */
  bits?: number;
}
