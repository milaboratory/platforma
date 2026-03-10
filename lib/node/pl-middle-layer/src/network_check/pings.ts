import type { ValueOrError } from "@milaboratories/ts-helpers";
import { setTimeout } from "node:timers/promises";
import { request } from "undici";
import type { Dispatcher } from "undici";
import type { CheckNetworkOpts } from "./network_check";
import { UnauthenticatedPlClient, type PlClientConfig } from "@milaboratories/pl-client";

/** A report about one concrete ping to the service. */
export interface NetworkReport<T> {
  elapsedMs: number;
  response: ValueOrError<T>;
}

export type HttpNetworkReport = NetworkReport<{
  statusCode: number;
  beginningOfBody: string;
}>;

export async function backendPings(
  ops: CheckNetworkOpts,
  plConfig: PlClientConfig,
): Promise<NetworkReport<string>[]> {
  return await recordPings(
    ops.pingCheckDurationMs,
    ops.maxPingsPerSecond,
    async () => {
      const uaClient = await UnauthenticatedPlClient.build(plConfig);
      const response = await uaClient.ping();
      return JSON.stringify(response).slice(0, ops.bodyLimit) + "...";
    },
    ops.signal,
  );
}

export async function blockRegistryOverviewPings(
  ops: CheckNetworkOpts,
  httpClient: Dispatcher,
): Promise<HttpNetworkReport[]> {
  return await recordPings(
    ops.blockRegistryDurationMs,
    ops.maxRegistryChecksPerSecond,
    async () =>
      await requestUrl(new URL(ops.blockOverviewPath, ops.blockRegistryUrl), ops, httpClient),
    ops.signal,
  );
}

export async function blockGARegistryOverviewPings(
  ops: CheckNetworkOpts,
  httpClient: Dispatcher,
): Promise<HttpNetworkReport[]> {
  return await recordPings(
    ops.blockRegistryDurationMs,
    ops.maxRegistryChecksPerSecond,
    async () =>
      await requestUrl(new URL(ops.blockOverviewPath, ops.blockGARegistryUrl), ops, httpClient),
    ops.signal,
  );
}

export async function blockRegistryUiPings(
  ops: CheckNetworkOpts,
  httpClient: Dispatcher,
): Promise<HttpNetworkReport[]> {
  return await recordPings(
    ops.blockRegistryDurationMs,
    ops.maxRegistryChecksPerSecond,
    async () => await requestUrl(new URL(ops.blockUiPath, ops.blockRegistryUrl), ops, httpClient),
    ops.signal,
  );
}

export async function blockGARegistryUiPings(
  ops: CheckNetworkOpts,
  httpClient: Dispatcher,
): Promise<HttpNetworkReport[]> {
  return await recordPings(
    ops.blockRegistryDurationMs,
    ops.maxRegistryChecksPerSecond,
    async () => await requestUrl(new URL(ops.blockUiPath, ops.blockGARegistryUrl), ops, httpClient),
    ops.signal,
  );
}

export async function autoUpdateCdnPings(
  ops: CheckNetworkOpts,
  httpClient: Dispatcher,
): Promise<HttpNetworkReport[]> {
  return await recordPings(
    ops.autoUpdateCdnDurationMs,
    ops.maxAutoUpdateCdnChecksPerSecond,
    async () => await requestUrl(ops.autoUpdateCdnUrl, ops, httpClient),
    ops.signal,
  );
}

/** Executes a body several times per second up to the given duration,
 * and returns results and elapsed time for every result. */
export async function recordPings<T>(
  pingCheckDurationMs: number,
  maxPingsPerSecond: number,
  body: () => Promise<T>,
  signal?: AbortSignal,
): Promise<NetworkReport<T>[]> {
  const startPings = Date.now();
  const reports: NetworkReport<T>[] = [];

  while (elapsed(startPings) < pingCheckDurationMs && !signal?.aborted) {
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
      try {
        await setTimeout(sleepBetweenPings, undefined, signal ? { signal } : undefined);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") break;
        throw e;
      }
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
    beginningOfBody: body.slice(0, ops.bodyLimit) + "...",
  };
}

export function elapsed(startMs: number): number {
  return Date.now() - startMs;
}

export function reportToString<T>(report: NetworkReport<T>[]): {
  ok: boolean;
  details: string;
} {
  const successes = report.filter((r) => r.response.ok);
  const errorsLen = report.length - successes.length;
  const { mean, median } = elapsedStat(report);

  const details = `
  total: ${report.length};
  successes: ${successes.length};
  errors: ${errorsLen};
  mean in ms: ${mean};
  median in ms: ${median};
  `;

  return {
    ok: errorsLen === 0,
    details,
  };
}

function elapsedStat(reports: { elapsedMs: number }[]) {
  if (reports.length === 0) return { mean: 0, median: undefined };
  const checks = reports.map((p) => p.elapsedMs).sort();
  const mean = checks.reduce((sum, p) => sum + p) / checks.length;

  let median = undefined;
  if (checks.length > 0) {
    const mid = Math.floor(checks.length / 2);
    median = checks.length % 2 ? checks[mid] : (checks[mid - 1] + checks[mid]) / 2;
  }

  return { mean, median };
}
