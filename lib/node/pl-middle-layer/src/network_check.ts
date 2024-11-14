/** An utility to check network problems and gather statistics.
 * It's useful when we cannot connect to the server of a company
 * because of security reasons,
 * but they can send us and their DevOps team this report. */

import { UnauthenticatedPlClient, plAddressToConfig } from '@milaboratories/pl-client';
import { ValueOrError } from '@milaboratories/ts-helpers';
import { setTimeout } from 'timers/promises';
import { request } from 'undici';

/** All reports we need to collect. */
interface networkReports {
  plPings: networkReport<string>[];
  blockRegistryChecks: networkReport<{
    statusCode: number;
    beginningOfBody: string;
  }>[];
  autoUpdateCdnChecks: networkReport<{
    statusCode: number;
    beginningOfBody: string;
  }>[];
}

export interface CheckNetworkOpts {
  /** Platforma Backend pings options. */
  pingCheckDurationMs: number;
  pingTimeoutMs: number;
  maxPingsPerSecond: number;

  /** An options for CDN and block registry. */
  httpTimeoutMs: number;

  /** Block registry pings options. */
  blockRegistryDurationMs: number;
  maxRegistryChecksPerSecond: number;
  blockRegistryUrl: string;

  /** CDN for auto-update pings options. */
  autoUpdateCdnDurationMs: number;
  maxAutoUpdateCdnChecksPerSecond: number;
  autoUpdateCdnUrl: string;
}

/** A report about one concrete ping to the service. */
interface networkReport<T> {
  elapsedMs: number;
  response: ValueOrError<T>;
}

/** Checks connectivity to Platforma Backend, to block registry
 * and to auto-update CDN,
 * and generates a string report. */
export async function checkNetwork(
  plCredentials: string,
  optsOverrides: Partial<CheckNetworkOpts> = {}
): Promise<string> {
  const opts: CheckNetworkOpts = {
    pingCheckDurationMs: 10000,
    pingTimeoutMs: 3000,
    maxPingsPerSecond: 50,

    httpTimeoutMs: 3000,

    blockRegistryDurationMs: 5000,
    maxRegistryChecksPerSecond: 1,
    blockRegistryUrl: 'https://blocks.pl-open.science/v2/overview.json',

    autoUpdateCdnDurationMs: 5000,
    maxAutoUpdateCdnChecksPerSecond: 1,
    autoUpdateCdnUrl:
      'https://cdn.platforma.bio/software/platforma-desktop-v2/windows/amd64/latest.yml',

    ...optsOverrides
  };

  const report: networkReports = {
    plPings: [],
    blockRegistryChecks: [],
    autoUpdateCdnChecks: []
  };

  const plConfig = plAddressToConfig(plCredentials, { defaultRequestTimeout: opts.pingTimeoutMs });

  report.plPings = await recordPings(opts.pingCheckDurationMs, opts.maxPingsPerSecond, async () => {
    const uaClient = new UnauthenticatedPlClient(plConfig);
    const response = await uaClient.ping();
    return JSON.stringify(response).slice(0, 100) + '...';
  });

  const uaClient = new UnauthenticatedPlClient(plConfig);
  const httpClient = uaClient.ll.httpDispatcher;

  report.blockRegistryChecks = await recordPings(
    opts.blockRegistryDurationMs,
    opts.maxRegistryChecksPerSecond,
    async () => {
      const { body: rawBody, statusCode } = await request(opts.blockRegistryUrl, {
        dispatcher: httpClient,
        headersTimeout: opts.httpTimeoutMs,
        bodyTimeout: opts.httpTimeoutMs
      });
      const body = await rawBody.text();

      return {
        statusCode: statusCode,
        beginningOfBody: body.slice(0, 100) + '...'
      };
    }
  );

  report.autoUpdateCdnChecks = await recordPings(
    opts.autoUpdateCdnDurationMs,
    opts.maxAutoUpdateCdnChecksPerSecond,
    async () => {
      const { body: rawBody, statusCode } = await request(opts.autoUpdateCdnUrl, {
        dispatcher: httpClient,
        headersTimeout: opts.httpTimeoutMs,
        bodyTimeout: opts.httpTimeoutMs
      });
      const body = await rawBody.text();

      return {
        statusCode: statusCode,
        beginningOfBody: body.slice(0, 100) + '...'
      };
    }
  );

  return reportsToString(report, plCredentials, opts);
}

/** Executes a body several times per second up to the given duration,
 * and returns results and elapsed time for every result. */
async function recordPings<T>(
  pingCheckDurationMs: number,
  maxPingsPerSecond: number,
  body: () => Promise<T>
): Promise<networkReport<T>[]> {
  const startPings = nowMs();
  const reports: networkReport<T>[] = [];

  while (elapsed(startPings) < pingCheckDurationMs) {
    const startPing = nowMs();
    let response: ValueOrError<T>;
    try {
      response = { ok: true, value: await body() };
    } catch (e) {
      response = { ok: false, error: e };
    }
    const elapsedPing = elapsed(startPing);

    reports.push({
      elapsedMs: elapsedPing,
      response
    });

    const sleepBetweenPings = 1000 / maxPingsPerSecond - elapsedPing;

    if (sleepBetweenPings > 0) await setTimeout(sleepBetweenPings);
  }

  return reports;
}

function reportsToString(
  report: networkReports,
  plEndpoint: string,
  opts: CheckNetworkOpts
): string {
  const successPings = report.plPings.filter((p) => p.response.ok);
  const failedPings = report.plPings.filter((p) => !p.response.ok);
  const successPingsBodies = [
    ...new Set(successPings.map((p) => JSON.stringify((p.response as any).value)))
  ];

  return `
Network report:
pl endpoint: ${plEndpoint};
options: ${JSON.stringify(opts, null, 2)}.

Platforma pings: ${reportToString(report.plPings)}

Block registry responses: ${reportToString(report.blockRegistryChecks)}

Auto-update CDN responses: ${reportToString(report.autoUpdateCdnChecks)}

Block registry dumps:
${JSON.stringify(report.blockRegistryChecks, null, 2)}

Auto-update CDN dumps:
${JSON.stringify(report.autoUpdateCdnChecks, null, 2)}

Platforma pings error dumps:
${JSON.stringify(failedPings, null, 2)}

Platforma pings success dump examples:
${JSON.stringify(successPingsBodies, null, 2)}
`;
}

function reportToString<T>(report: networkReport<T>[]): string {
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

function nowMs(): number {
  return Date.now();
}

function elapsed(startMs: number): number {
  return nowMs() - startMs;
}
