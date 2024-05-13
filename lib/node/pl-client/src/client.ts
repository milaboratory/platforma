import { AuthOps, PlConnectionConfig } from './config';
import { LLPlClient, PlConnectionStatusListener } from './ll_client';

/** Client to access core PL API. */
export class PlClient {
  private readonly ll: LLPlClient;

  constructor(configOrAddress: PlConnectionConfig | string,
              ops: {
                plAuthOptions?: AuthOps,
                statusListener?: PlConnectionStatusListener
              } = {}) {
    this.ll = new LLPlClient(configOrAddress, ops);
  }

}
