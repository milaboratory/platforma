const max_unwrap_depth = 10;

export class SSHError extends Error {
  name = 'SSHError';

  constructor(message: string, opts?: { cause: Error });
  constructor(cause: Error);
  constructor(messageOrCause: string | Error, opts?: { cause: Error }) {
    if (messageOrCause instanceof Error) {
      super(`SSHError: ${messageOrCause.message}`, { cause: opts?.cause ?? messageOrCause });
    } else {
      super(`SSHError: ${messageOrCause}`, opts);
    }
  }

  static from(err: unknown, depth: number = 0): SSHError | undefined {
    return findInCauseChain(err, SSHError, depth);
  }
}

export class SFTPError extends SSHError {
  name = 'SFTPError';

  constructor(
    public readonly code: string, // raw SFTP error code, i.e. from OpenSSH server
    opts?: { cause: Error },
  ) {
    super(code, opts);
  }

  static wrap(err: Error): SFTPError;
  static wrap(err: undefined): undefined;
  static wrap(err: Error | undefined): SFTPError | undefined {
    if (!err) return undefined;
    const sftpErr = SFTPError.from(err);
    if (sftpErr) return sftpErr;
    return new SFTPError(err.message, { cause: err });
  }

  /** Optionally wraps an error into SFTPError, if it is not already of this type */
  static from(err: unknown, depth: number = 0): SFTPError | undefined {
    return findInCauseChain(err, SFTPError, depth);
  }

  public get isGenericFailure(): boolean {
    // OpenSSH server returns this message in case of general failure.
    // See https://github.com/openssh/openssh-portable/blob/1cc936b2fabffeac7fff14ca1070d7d7a317ab7b/sftp-server.c#L244
    // See https://github.com/openssh/openssh-portable/blob/1cc936b2fabffeac7fff14ca1070d7d7a317ab7b/sftp-common.c#L195
    return this.code === 'Failure';
  }
}

export class SFTPUploadError extends SSHError {
  name = 'SFTPUploadError';

  constructor(
    public readonly cause: Error,
    public readonly localPath: string,
    public readonly remotePath: string,
  ) {
    super(`ssh.uploadFile: ${cause}, localPath: ${localPath}, remotePath: ${remotePath}`, { cause: SFTPError.wrap(cause) });
  }

  static from(err: unknown, depth: number = 0): SFTPUploadError | undefined {
    return findInCauseChain(err, SFTPUploadError, depth);
  }
}

function findInCauseChain<T extends Error>(
  err: unknown,
  errorConstructor: (new (...args: any[]) => T) & { name: string },
  depth: number = 0,
): T | undefined {
  if (err instanceof errorConstructor) return err;
  if ((err as any)?.name === errorConstructor.name) return err as T;
  if (depth >= max_unwrap_depth) return undefined;
  if ((err as any)?.cause) {
    return findInCauseChain((err as any).cause, errorConstructor, depth + 1);
  }
  return undefined;
}
