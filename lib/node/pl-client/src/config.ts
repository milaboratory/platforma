import { VerifyOptions } from '@grpc/grpc-js';

export interface PlClientConfig {
  ssl?: {
    rootCerts?: Buffer | null,
    privateKey?: Buffer | null,
    certChain?: Buffer | null,
    verifyOptions?: VerifyOptions
  };
}
