import { Observable, ObservableAccessor } from '../observable';
import { ComputableDataSource, ComputableReactor } from './reactor';
import { TrackedAccessorProvider } from './accessor_provider';
import { Aborted, sleep } from '@milaboratory/ts-helpers';
import { Computable } from './computable';
import { computable } from './computable_helpers';

class Synchronizer implements ComputableDataSource<ObservableAccessor<number>> {
  private schedulerAbort: (() => void) | undefined = undefined;

  constructor(private readonly src: Computable<number>, private readonly dst: Observable<number>) {
  }

  get active(): boolean {
    return this.schedulerAbort !== undefined;
  }

  get accessorFactory(): TrackedAccessorProvider<ObservableAccessor<number>> {
    return this.dst;
  }

  startUpdating(): void {
    const abort = new AbortController();

    // this.schedulerAbort in theory may still be defined but it is ok

    this.schedulerAbort = () => {
      abort.abort();
    };
    (async () => {
      try {
        while (true) {
          await this.src.listen(abort.signal);
          this.dst.setValue(await this.src.getValue());
        }
      } catch (err) {
        expect(err).toBeInstanceOf(Aborted);
      } finally {
        this.schedulerAbort = undefined;
      }
    })();
  }

  stopUpdating(): void {
    if (this.schedulerAbort === undefined)
      throw new Error('Unexpected call.');
    this.schedulerAbort();
  }
}

test('simple reactor test poll', async () => {
  const observableSource = new Observable(2);
  const synchronizer = new Synchronizer(
    computable(observableSource, {}, a => a.getValue()),
    new Observable(1));
  const reactor = new ComputableReactor(synchronizer, { stopDebounce: 10 });
  const res2 = reactor.computable({}, a => a.getValue() * 2);

  expect(synchronizer.active).toEqual(false);
  expect(await res2.getValue()).toEqual(2);
  expect(synchronizer.active).toEqual(true);
  await new Promise(resolve => setImmediate(resolve));
  expect(await res2.getValue()).toEqual(4);
  expect(synchronizer.active).toEqual(true);
  observableSource.setValue(10);
  await new Promise(resolve => setImmediate(resolve));
  expect(await res2.getValue()).toEqual(20);
  expect(synchronizer.active).toEqual(true);
  await sleep(20);
  expect(synchronizer.active).toEqual(false);

  observableSource.setValue(20);
  await new Promise(resolve => setImmediate(resolve));
  expect(synchronizer.active).toEqual(false);
  expect(await res2.getValue()).toEqual(20);
  expect(synchronizer.active).toEqual(true);
  await new Promise(resolve => setImmediate(resolve));
  expect(await res2.getValue()).toEqual(40);
  expect(synchronizer.active).toEqual(true);
});


test('simple reactor test listen', async () => {
  const observableSource = new Observable(2);
  const synchronizer = new Synchronizer(
    computable(observableSource, {}, a => a.getValue()),
    new Observable(1));
  const reactor = new ComputableReactor(synchronizer, { stopDebounce: 10 });
  const res2 = reactor.computable({}, a => a.getValue() * 2);

  expect(await res2.getValue()).toEqual(2);
  await new Promise(resolve => setImmediate(resolve));
  expect(await res2.getValue()).toEqual(4);

  // indefinite listener
  const listener1 = res2.listen();
  await sleep(20);

  // still active
  expect(synchronizer.active).toEqual(true);
  observableSource.setValue(10);
  await listener1;
  expect(await res2.getValue()).toEqual(20);
  await sleep(20);

  // now stopped
  expect(synchronizer.active).toEqual(false);

  // indefinite listener
  const listener2 = res2.listen(AbortSignal.timeout(10));
  await expect(listener2).rejects.toThrow(Aborted);
  expect(synchronizer.active).toEqual(true);
  await sleep(20);
  expect(synchronizer.active).toEqual(false);
});
