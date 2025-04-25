import type { ValueOrError } from '@milaboratories/ts-helpers';
import { setTimeout } from 'node:timers/promises';
import { request } from 'undici';
import type { Dispatcher } from 'undici';
import type { CheckNetworkOpts } from './network_check';
import { UnauthenticatedPlClient, type PlClientConfig } from '@milaboratories/pl-client';

/** A report about one concrete ping to the service. */
export interface NetworkReport<T> {
  elapsedMs: number;
  response: ValueOrError<T>;
}

export type HttpNetworkReport = NetworkReport<{
  statusCode: number;
  beginningOfBody: string;
}>;

export async function backendPings(ops: CheckNetworkOpts, plConfig: PlClientConfig): Promise<NetworkReport<string>[]> {
  return await recordPings(ops.pingCheckDurationMs, ops.maxPingsPerSecond, async () => {
    const uaClient = new UnauthenticatedPlClient(plConfig);
    const response = await uaClient.ping();
    return JSON.stringify(response).slice(0, ops.bodyLimit) + '...';
  });
}

export async function blockRegistryOverviewPings(ops: CheckNetworkOpts, httpClient: Dispatcher): Promise<HttpNetworkReport[]> {
  return await recordPings(
    ops.blockRegistryDurationMs,
    ops.maxRegistryChecksPerSecond,
    async () =>
      await requestUrl(new URL(ops.blockOverviewPath, ops.blockRegistryUrl), ops, httpClient),
  );
}

export async function blockGARegistryOverviewPings(ops: CheckNetworkOpts, httpClient: Dispatcher): Promise<HttpNetworkReport[]> {
  return await recordPings(
    ops.blockRegistryDurationMs,
    ops.maxRegistryChecksPerSecond,
    async () => await requestUrl(new URL(ops.blockOverviewPath, ops.blockGARegistryUrl), ops, httpClient),
  );
}

export async function blockRegistryUiPings(ops: CheckNetworkOpts, httpClient: Dispatcher): Promise<HttpNetworkReport[]> {
  return await recordPings(
    ops.blockRegistryDurationMs,
    ops.maxRegistryChecksPerSecond,
    async () => await requestUrl(new URL(ops.blockUiPath, ops.blockRegistryUrl), ops, httpClient),
  );
}

export async function blockGARegistryUiPings(ops: CheckNetworkOpts, httpClient: Dispatcher): Promise<HttpNetworkReport[]> {
  return await recordPings(
    ops.blockRegistryDurationMs,
    ops.maxRegistryChecksPerSecond,
    async () => await requestUrl(new URL(ops.blockUiPath, ops.blockGARegistryUrl), ops, httpClient),
  );
}

export async function autoUpdateCdnPings(ops: CheckNetworkOpts, httpClient: Dispatcher): Promise<HttpNetworkReport[]> {
  return await recordPings(
    ops.autoUpdateCdnDurationMs,
    ops.maxAutoUpdateCdnChecksPerSecond,
    async () => await requestUrl(ops.autoUpdateCdnUrl, ops, httpClient),
  );
}

/** Executes a body several times per second up to the given duration,
 * and returns results and elapsed time for every result. */
export async function recordPings<T>(
  pingCheckDurationMs: number,
  maxPingsPerSecond: number,
  body: () => Promise<T>,
): Promise<NetworkReport<T>[]> {
  const startPings = Date.now();
  const reports: NetworkReport<T>[] = [];

  while (elapsed(startPings) < pingCheckDurationMs) {
    const startPing = Date.now();
    let response: ValueOrError<T>;
    try {
      response = { ok: true, value: await body() };
    } catch (e) {
      response = { ok: false, error: e };
    }
    const elapsedPing = elapsed(startPing);

    reports.push({
      elapsedMs: elapsedPing,
      response,
    });

    const sleepBetweenPings = 1000 / maxPingsPerSecond - elapsedPing;

    if (sleepBetweenPings > 0) {
      await setTimeout(sleepBetweenPings);
    }
  }

  return reports;
}

export async function requestUrl(url: string | URL, ops: CheckNetworkOpts, httpClient: Dispatcher) {
  const { body: rawBody, statusCode } = await request(url, {
    dispatcher: httpClient,
    headersTimeout: ops.httpTimeoutMs,
    bodyTimeout: ops.httpTimeoutMs,
  });
  const body = await rawBody.text();

  return {
    statusCode: statusCode,
    beginningOfBody: body.slice(0, ops.bodyLimit) + '...',
  };
}

export function elapsed(startMs: number): number {
  return Date.now() - startMs;
}

export function reportToString<T>(report: NetworkReport<T>[]): string {
  const successes = report.filter((r) => r.response.ok);
  const { mean: mean, median: median } = elapsedStat(report);

  return `
  total: ${report.length};
  successes: ${successes.length};
  errors: ${report.length - successes.length};
  mean in ms: ${mean};
  median in ms: ${median};
  `;
}

function elapsedStat(reports: { elapsedMs: number }[]) {
  const checks = reports.map((p) => p.elapsedMs);
  const mean = checks.reduce((sum, p) => sum + p) / checks.length;

  let median = undefined;
  if (checks.length > 0) {
    const mid = Math.floor(checks.length / 2);
    median = checks.length % 2 ? checks[mid] : (checks[mid - 1] + checks[mid]) / 2;
  }

  return { mean, median };
}
