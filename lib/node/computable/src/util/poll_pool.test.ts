import * as tp from 'node:timers/promises';
import type { PollActor} from './poll_pool';
import { PollComputablePool, PollPool } from './poll_pool';
import { ChangeSource } from '../change_source';

class TestPollActor implements PollActor {
  public polls: number = 0;

  async poll() {
    this.polls++;
  }

  private _pollPauseRequest: symbol | undefined;
  readonly pollPauseRequestChange = new ChangeSource();

  public get pollPauseRequest() {
    return this._pollPauseRequest;
  }

  public set pollPauseRequest(value: symbol | undefined) {
    this._pollPauseRequest = value;
    this.pollPauseRequestChange.markChanged();
  }
}

test('simple poll pool test', async () => {
  const pool = new PollPool({ minDelay: 10 });

  const actor = new TestPollActor();
  const aSymbol = pool.add(actor);

  await tp.setTimeout(25);
  const polls1 = actor.polls;
  expect(polls1).toBeGreaterThanOrEqual(2);
  actor.pollPauseRequest = Symbol();
  await tp.setTimeout(15);
  const polls2 = actor.polls;
  expect(polls2).toStrictEqual(polls1 + 1);

  actor.pollPauseRequest = Symbol();
  await tp.setTimeout(15);
  const polls3 = actor.polls;
  expect(polls3).toStrictEqual(polls2 + 1);

  pool.removeActor(aSymbol);

  actor.pollPauseRequest = Symbol();
  await tp.setTimeout(15);
  const polls4 = actor.polls;
  expect(polls4).toStrictEqual(polls3);

  await pool.terminate();
});

class TestComputablePool extends PollComputablePool<string, string | undefined> {
  public map = new Map<string, string>();

  constructor() {
    super({ minDelay: 10 });
  }

  protected getKey(req: string): string {
    return req;
  }

  protected readValue(req: string): string | undefined {
    return this.map.get(req);
  }

  protected resultsEqual(res1: string, res2: string): boolean {
    return res1 === res2;
  }
}

test('simple poll pool computable test', async () => {
  const pool = new TestComputablePool();
  const ca = pool.get('a').withPreCalculatedValueTree();
  const cb = pool.get('b').withPreCalculatedValueTree();
  expect(await ca.getValue()).toBeUndefined();
  expect(await cb.getValue()).toBeUndefined();
  pool.map.set('a', 'a1');
  await ca.refreshState();
  expect(await ca.getValue()).toStrictEqual('a1');
  await cb.refreshState();
  expect(await cb.getValue()).toBeUndefined();

  pool.map.set('b', 'b1');
  await ca.refreshState();
  expect(ca.isChanged()).toStrictEqual(false);
  await cb.refreshState();
  expect(await cb.getValue()).toStrictEqual('b1');

  await pool.terminate();
});
