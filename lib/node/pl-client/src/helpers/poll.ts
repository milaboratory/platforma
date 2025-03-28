import type { PlClient } from '../core/client';
import type {
  RetryOptions,
} from '@milaboratories/ts-helpers';
import {
  createRetryState,
  nextRetryStateOrError,
  notEmpty,
} from '@milaboratories/ts-helpers';
import type {
  FieldData,
  FieldType,
  ResourceData,
  ResourceId } from '../core/types';
import {
  isNotNullResourceId,
  isNullResourceId,
  resourceIdToString,
} from '../core/types';
import type { PlTransaction } from '../core/transaction';
import * as tp from 'node:timers/promises';

/** This error tells state assertion mechanism that required state is not yet ready */
export class ContinuePolling extends Error {}

export type PollFieldTraverseOps = {
  expectedType?: FieldType;
  /** Fail if error present along with the value, if value not present,
   * but error do, exception will be thrown anyway. */
  failOnError: boolean;
  /** Traverse only if field report its value as final. */
  onlyFinal: boolean;
};

const DefaultPollFieldTraverseOps: PollFieldTraverseOps = {
  failOnError: true,
  onlyFinal: false,
};

export class PollResourceAccessor {
  constructor(
    public readonly tx: PollTxAccessor,
    public readonly data: ResourceData,
    public readonly path: string[],
  ) {}

  public final(): PollResourceAccessor {
    if (!this.data.final) throw new ContinuePolling();
    return this;
  }

  public async requireNoError(): Promise<PollResourceAccessor> {
    if (isNullResourceId(this.data.error)) return this;
    await this.tx.throwError(this.data.error, this.path);
    // hmm... https://github.com/microsoft/TypeScript/issues/34955
    return this;
  }

  public getFieldData(name: string, expectedType?: FieldType): FieldData {
    const fieldData = this.data.fields.find((f) => f.name === name);

    if (fieldData !== undefined) {
      if (expectedType !== undefined && fieldData.type !== expectedType)
        throw new Error(`Unexpected field type. Expected ${expectedType}, found ${fieldData.type}`);
      return fieldData;
    }

    if (
      ((expectedType === 'Input' || expectedType === 'Service') && this.data.inputsLocked)
      || (expectedType === 'Output' && this.data.outputsLocked)
    )
      throw new Error(
        // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
        `Field "${name}" not found. Expected type: ${expectedType}, state: ${this.data}`,
      );

    throw new ContinuePolling();
  }

  public async get(
    name: string,
    ops: Partial<PollFieldTraverseOps> = {},
  ): Promise<PollResourceAccessor> {
    const { expectedType, failOnError } = { ...DefaultPollFieldTraverseOps, ...ops };
    const path = [...this.path, name];

    const fieldData = this.getFieldData(name, expectedType);
    if (isNotNullResourceId(fieldData.error) && (failOnError || isNullResourceId(fieldData.value)))
      await this.tx.throwError(fieldData.error, path);

    if (isNullResourceId(fieldData.value)) throw new ContinuePolling();

    return await this.tx.get(fieldData.value, failOnError, path);
  }

  public async getMulti(
    ops: Partial<PollFieldTraverseOps>,
    ...names: string[]
  ): Promise<PollResourceAccessor[]> {
    return await Promise.all(names.map((name) => this.get(name, ops)));
  }

  public async getMultiObj<Key extends string>(
    ops: Partial<PollFieldTraverseOps>,
    ...names: Key[]
  ): Promise<Record<Key, PollResourceAccessor>> {
    return Object.fromEntries(
      await Promise.all(names.map(async (name) => [name, await this.get(name, ops)])),
    );
  }

  public async getAllFinal(
    ops: Partial<PollFieldTraverseOps> = {},
  ): Promise<Record<string, PollResourceAccessor>> {
    return await this.getMultiObj(
      ops,
      ...this.data.fields
        .filter((f) => f.valueIsFinal || isNotNullResourceId(f.error))
        .map((f) => f.name),
    );
  }

  public async getKValue(key: string): Promise<string> {
    const value = await this.tx.tx.getKValueStringIfExists(this.data.id, key);
    if (value === undefined) throw new ContinuePolling();
    return value;
  }

  public async getKValueObj<T>(key: string): Promise<T> {
    return JSON.parse(await this.getKValue(key)) as T;
  }
}

export class PollTxAccessor {
  constructor(public readonly tx: PlTransaction) {}

  public async get(
    rid: ResourceId,
    failOnError: boolean = true,
    path: string[] = [],
  ): Promise<PollResourceAccessor> {
    const data = await this.tx.getResourceData(rid, true);
    const accessor = new PollResourceAccessor(this, data, [...path, resourceIdToString(rid)]);
    if (failOnError) await accessor.requireNoError();
    return accessor;
  }

  async throwError(error: ResourceId, path: string[] = []): Promise<never> {
    const errorRes = await this.get(error);
    const errorText = Buffer.from(notEmpty(errorRes.data.data)).toString();
    throw new Error(`${path.join(' -> ')} = ${errorText}`);
  }
}

export const DefaultPollingRetryOptions: RetryOptions = {
  type: 'linearBackoff',
  jitter: 0,
  maxAttempts: 100,
  backoffStep: 10,
  initialDelay: 10,
};

export async function poll<T>(
  cl: PlClient,
  cb: (tx: PollTxAccessor) => Promise<T>,
  retryOptions: RetryOptions = DefaultPollingRetryOptions,
  txName: string = 'polling',
): Promise<T> {
  let retryState = createRetryState(retryOptions);
  while (true) {
    try {
      return await cl.withReadTx(txName, async (tx) => {
        return await cb(new PollTxAccessor(tx));
      });
    } catch (e: any) {
      // Rethrowing any error except the "not ready yet"
      if (!(e instanceof ContinuePolling)) throw e;
    }
    await tp.setTimeout(retryState.nextDelay);
    retryState = nextRetryStateOrError(retryState);
  }
}
