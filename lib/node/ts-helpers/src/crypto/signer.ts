import { randomBytes, createHmac } from 'crypto';

/** Creates and validates signatures. */
export interface Signer {
  /** Returns string encoded signature (hex). */
  sign(data: string | Uint8Array): string;

  /** Given the data and signature verifies the signature, and throws an exception
   * if verification fails. */
  verify(data: string | Uint8Array, signature: string, validationErrorMessage?: string): void;
}

/** Exception is thrown from {@link Signer} in case signature verification failed. */
export class SignatureVerificationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/** So far the only {@link Signer} implementation. */
export class HmacSha256Signer implements Signer {
  constructor(private readonly secret: string | Uint8Array) {}

  sign(data: string | Uint8Array): string {
    return createHmac('sha256', this.secret).update(data).digest('hex');
  }

  verify(data: string | Uint8Array, signature: string, validationErrorMessage?: string): void {
    if (signature !== createHmac('sha256', this.secret).update(data).digest('hex')) {
      if (validationErrorMessage === undefined)
        throw new SignatureVerificationError(`Signature verification failed for ${data}`);
      else throw new SignatureVerificationError(validationErrorMessage);
    }
  }

  /** Generates a sufficiently long random key to create signatures using this
   * signer with secure random generator. Generated key is a string to simplify
   * its persistence. */
  public static generateSecret(): string {
    // https://crypto.stackexchange.com/questions/31473/what-size-should-the-hmac-key-be-with-sha-256
    return randomBytes(32).toString('base64');
  }
}
