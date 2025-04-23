/** A utility to check network problems and gather statistics.
 * It's useful when we cannot connect to the server of a company
 * because of security reasons,
 * but they can send us and their DevOps team this report.
 *
 * What we check:
 * - pings to backend
 * - block registry for block overview and ui.
 * - autoupdate CDN.
 * - the desktop could do multipart upload.
 * - the desktop could download files from S3.
 * - backend could download software and run it.
 * - backend could run python software.
 *
 * We don't check backend access to S3 storage, it is checked on the start of backend.
 */

import { UnauthenticatedPlClient, plAddressToConfig } from '@milaboratories/pl-client';
import type { ValueOrError } from '@milaboratories/ts-helpers';
import { setTimeout } from 'node:timers/promises';
import type { Dispatcher } from 'undici';
import { request } from 'undici';
import { channel } from 'node:diagnostics_channel';

/** All reports we need to collect. */
interface networkReports {
  plPings: networkReport<string>[];

  blockRegistryOverviewChecks: httpNetworkReport[];
  blockGARegistryOverviewChecks: httpNetworkReport[];
  blockRegistryUiChecks: httpNetworkReport[];
  blockGARegistryUiChecks: httpNetworkReport[];

  autoUpdateCdnChecks: httpNetworkReport[];
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
  blockGARegistryUrl: string;
  blockOverviewPath: string;
  blockUiPath: string;

  /** CDN for auto-update pings options. */
  autoUpdateCdnDurationMs: number;
  maxAutoUpdateCdnChecksPerSecond: number;
  autoUpdateCdnUrl: string;

  bodyLimit: number;
}

/** A report about one concrete ping to the service. */
interface networkReport<T> {
  elapsedMs: number;
  response: ValueOrError<T>;
}

type httpNetworkReport = networkReport<{
  statusCode: number;
  beginningOfBody: string;
}>;

// List of Undici diagnostic channels
const undiciEvents: string[] = [
  'undici:request:create', // When a new request is created
  'undici:request:bodySent', // When the request body is sent
  'undici:request:headers', // When request headers are sent
  'undici:request:error', // When a request encounters an error
  'undici:request:trailers', // When a response completes.

  'undici:client:sendHeaders',
  'undici:client:beforeConnect',
  'undici:client:connected',
  'undici:client:connectError',

  'undici:socket:close', // When a socket is closed
  'undici:socket:connect', // When a socket connects
  'undici:socket:error', // When a socket encounters an error

  'undici:pool:request', // When a request is added to the pool
  'undici:pool:connect', // When a pool creates a new connection
  'undici:pool:disconnect', // When a pool connection is closed
  'undici:pool:destroy', // When a pool is destroyed
  'undici:dispatcher:request', // When a dispatcher processes a request
  'undici:dispatcher:connect', // When a dispatcher connects
  'undici:dispatcher:disconnect', // When a dispatcher disconnects
  'undici:dispatcher:retry', // When a dispatcher retries a request
];

/** Checks connectivity to Platforma Backend, to block registry
 * and to auto-update CDN,
 * and generates a string report. */
export async function checkNetwork(
  plCredentials: string,
  optsOverrides: Partial<CheckNetworkOpts> = {},
): Promise<string> {
  const ops: CheckNetworkOpts = {
    pingCheckDurationMs: 10000,
    pingTimeoutMs: 3000,
    maxPingsPerSecond: 50,

    httpTimeoutMs: 3000,

    blockRegistryDurationMs: 3000,
    maxRegistryChecksPerSecond: 1,

    blockRegistryUrl: 'https://blocks.pl-open.science',
    blockGARegistryUrl: 'https://blocks-ga.pl-open.science',
    blockOverviewPath: 'v2/overview.json',
    blockUiPath: 'v2/milaboratories/samples-and-data/1.7.0/ui.tgz',

    autoUpdateCdnDurationMs: 5000,
    maxAutoUpdateCdnChecksPerSecond: 1,
    autoUpdateCdnUrl:
      'https://cdn.platforma.bio/software/platforma-desktop-v2/windows/amd64/latest.yml',

    bodyLimit: 300,

    ...optsOverrides,
  };

  const undiciLogs: any[] = [];
  // Subscribe to all Undici diagnostic events
  undiciEvents.forEach((event) => {
    const diagnosticChannel = channel(event);
    diagnosticChannel.subscribe((message: any) => {
      const timestamp = new Date().toISOString();
      if (message?.response?.headers)
        message.response.headers = message.response.headers.map((h: any) => h.toString());

      undiciLogs.push(
        JSON.stringify({
          timestamp,
          event,
          data: message,
        }),
      );
    });
  });

  const report: networkReports = {
    plPings: [],
    blockRegistryOverviewChecks: [],
    blockGARegistryOverviewChecks: [],
    blockRegistryUiChecks: [],
    blockGARegistryUiChecks: [],

    autoUpdateCdnChecks: [],
  };

  const plConfig = plAddressToConfig(plCredentials, { defaultRequestTimeout: ops.pingTimeoutMs });

  report.plPings = await recordPings(ops.pingCheckDurationMs, ops.maxPingsPerSecond, async () => {
    const uaClient = new UnauthenticatedPlClient(plConfig);
    const response = await uaClient.ping();
    return JSON.stringify(response).slice(0, ops.bodyLimit) + '...';
  });

  const uaClient = new UnauthenticatedPlClient(plConfig);
  const httpClient = uaClient.ll.httpDispatcher;

  report.blockRegistryOverviewChecks = await recordPings(
    ops.blockRegistryDurationMs,
    ops.maxRegistryChecksPerSecond,
    async () =>
      await requestUrl(new URL(ops.blockOverviewPath, ops.blockRegistryUrl), ops, httpClient),
  );

  report.blockGARegistryOverviewChecks = await recordPings(
    ops.blockRegistryDurationMs,
    ops.maxRegistryChecksPerSecond,
    async () =>
      await requestUrl(new URL(ops.blockOverviewPath, ops.blockGARegistryUrl), ops, httpClient),
  );

  report.blockRegistryUiChecks = await recordPings(
    ops.blockRegistryDurationMs,
    ops.maxRegistryChecksPerSecond,
    async () => await requestUrl(new URL(ops.blockUiPath, ops.blockRegistryUrl), ops, httpClient),
  );

  report.blockGARegistryUiChecks = await recordPings(
    ops.blockRegistryDurationMs,
    ops.maxRegistryChecksPerSecond,
    async () => await requestUrl(new URL(ops.blockUiPath, ops.blockGARegistryUrl), ops, httpClient),
  );

  report.autoUpdateCdnChecks = await recordPings(
    ops.autoUpdateCdnDurationMs,
    ops.maxAutoUpdateCdnChecksPerSecond,
    async () => await requestUrl(ops.autoUpdateCdnUrl, ops, httpClient),
  );

  return reportsToString(report, plCredentials, ops, undiciLogs);
}

/** Executes a body several times per second up to the given duration,
 * and returns results and elapsed time for every result. */
async function recordPings<T>(
  pingCheckDurationMs: number,
  maxPingsPerSecond: number,
  body: () => Promise<T>,
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
      response,
    });

    const sleepBetweenPings = 1000 / maxPingsPerSecond - elapsedPing;

    if (sleepBetweenPings > 0) await setTimeout(sleepBetweenPings);
  }

  return reports;
}

async function requestUrl(url: string | URL, ops: CheckNetworkOpts, httpClient: Dispatcher) {
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

function reportsToString(
  report: networkReports,
  plEndpoint: string,
  opts: CheckNetworkOpts,
  undiciLogs: any[],
): string {
  const successPings = report.plPings.filter((p) => p.response.ok);
  const failedPings = report.plPings.filter((p) => !p.response.ok);
  const successPingsBodies = [
    ...new Set(successPings.map((p) => JSON.stringify((p.response as any).value))),
  ];

  return `
Network report:
pl endpoint: ${plEndpoint};
options: ${JSON.stringify(opts, null, 2)}.

Platforma pings: ${reportToString(report.plPings)}

Block registry overview responses: ${reportToString(report.blockRegistryOverviewChecks)}

Block ga registry overview responses: ${reportToString(report.blockGARegistryOverviewChecks)}

Block registry ui responses: ${reportToString(report.blockRegistryUiChecks)}

Block ga registry ui responses: ${reportToString(report.blockGARegistryUiChecks)}

Auto-update CDN responses: ${reportToString(report.autoUpdateCdnChecks)}

Block registry overview dumps:
${JSON.stringify(report.blockRegistryOverviewChecks, null, 2)}

Block ga registry overview dumps:
${JSON.stringify(report.blockGARegistryOverviewChecks, null, 2)}

Block registry ui dumps:
${JSON.stringify(report.blockRegistryUiChecks, null, 2)}

Block ga registry ui dumps:
${JSON.stringify(report.blockGARegistryUiChecks, null, 2)}

Auto-update CDN dumps:
${JSON.stringify(report.autoUpdateCdnChecks, null, 2)}

Platforma pings error dumps:
${JSON.stringify(failedPings, null, 2)}

Platforma pings success dump examples:
${JSON.stringify(successPingsBodies, null, 2)}

Undici logs:
${undiciLogs.join('\n')}
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
