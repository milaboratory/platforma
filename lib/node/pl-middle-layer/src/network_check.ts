import { UnauthenticatedPlClient, plAddressToConfig } from "@milaboratories/pl-client";
import { ValueOrError } from "@milaboratories/ts-helpers";
import { setTimeout } from 'timers/promises';
import { request } from "undici";

export async function checkNetwork(
  plCredentials: string,
  optsOverrides: Partial<CheckNetworkOpts> = {},
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
    autoUpdateCdnUrl: 'https://cdn.platforma.bio/software/platforma-desktop-v2/windows/amd64/latest.yml',

    ...optsOverrides
  }

  const report: networkReports = {
    plPings: [],
    blockRegistryChecks: [],
    autoUpdateCdnChecks: []
  };

  const plConfig = plAddressToConfig(
    plCredentials,
    { defaultRequestTimeout: opts.pingTimeoutMs }
  );

  report.plPings = await ping(
    opts.pingCheckDurationMs,
    opts.maxPingsPerSecond,
    async () => {
      const uaClient = new UnauthenticatedPlClient(plConfig);
      const response = await uaClient.ping();
      return JSON.stringify(response).slice(0, 100) + '...';
    }
  );

  const uaClient = new UnauthenticatedPlClient(plConfig);
  const httpClient = uaClient.ll.httpDispatcher;

  report.blockRegistryChecks = await ping(
    opts.blockRegistryDurationMs,
    opts.maxRegistryChecksPerSecond,
    async () => {
      const { body: rawBody, statusCode } = await request(opts.blockRegistryUrl, {
        dispatcher: httpClient,
        bodyTimeout: opts.httpTimeoutMs
      });
      const body = await rawBody.text();

      return {
        statusCode: statusCode,
        beginningOfBody: body.slice(0, 100) + '...'
      };
    }
  );

  report.autoUpdateCdnChecks = await ping(
    opts.autoUpdateCdnDurationMs,
    opts.maxAutoUpdateCdnChecksPerSecond,
    async () => {
      const { body: rawBody, statusCode } = await request(opts.autoUpdateCdnUrl, {
        dispatcher: httpClient,
        bodyTimeout: opts.httpTimeoutMs
      });
      const body = await rawBody.text();

      return {
        statusCode: statusCode,
        beginningOfBody: body.slice(0, 100) + '...'
      };
    }
  );

  return reportToString(report, plCredentials, opts);
}

export interface CheckNetworkOpts {
  pingCheckDurationMs: number;
  pingTimeoutMs: number;
  maxPingsPerSecond: number;

  httpTimeoutMs: number;

  blockRegistryDurationMs: number;
  maxRegistryChecksPerSecond: number;
  blockRegistryUrl: string;

  autoUpdateCdnDurationMs: number;
  maxAutoUpdateCdnChecksPerSecond: number;
  autoUpdateCdnUrl: string;
};

interface networkReports {
  plPings: {
    elapsedMs: number;
    response: ValueOrError<string>;
  }[];
  blockRegistryChecks: {
    elapsedMs: number;
    response: ValueOrError<{
      statusCode: number;
      beginningOfBody: string;
    }>;
  }[];
  autoUpdateCdnChecks: {
    elapsedMs: number;
    response: ValueOrError<{
      statusCode: number;
      beginningOfBody: string;
    }>;
  }[];
}

interface networkReport<T> {
  elapsedMs: number;
  response: ValueOrError<T>;
}

async function ping<T>(
  pingCheckDurationMs: number,
  maxPingsPerSecond: number,
  body: () => Promise<T>
): Promise<networkReport<T>[]> {
  const startPings = nowMs();
  const reports: networkReport<T>[] = [];
  while (elapsed(startPings) < pingCheckDurationMs) {
    const startPing = nowMs();

    try {
      const response = await body();

      reports.push({
        elapsedMs: elapsed(startPing),
        response: { ok: true, value: response }
      });
    } catch (e) {
      reports.push({
        elapsedMs: elapsed(startPing),
        response: { ok: false, error: e }
      });
    }

    if (elapsed(startPing) < (1000 / maxPingsPerSecond)) {
      await setTimeout((1000 / maxPingsPerSecond) - elapsed(startPing));
    }
  }

  return reports;
}

function reportToString(report: networkReports, plEndpoint: string, opts: CheckNetworkOpts): string {
  const successPings = report.plPings.filter(p => p.response.ok);
  const failedPings = report.plPings.filter(p => !p.response.ok);
  const { mean: pingsMean, median: pingsMedian } = elapsedStat(report.plPings);
  const successPingsBodies = [...new Set( successPings.map(p => JSON.stringify((p.response as any).value)))];

  const successRegistryChecks = report.blockRegistryChecks.filter(r => r.response.ok).length;
  const { mean: registryMean, median: registryMedian } = elapsedStat(report.blockRegistryChecks);

  const successCdnChecks = report.autoUpdateCdnChecks.filter(c => c.response.ok).length;
  const { mean: cdnMean, median: cdnMedian } = elapsedStat(report.autoUpdateCdnChecks);

  return `
Network report:
pl endpoint: ${plEndpoint};
options: ${JSON.stringify(opts, null, 2)}.

Platforma pings:
total: ${report.plPings.length};
successes: ${successPings.length};
errors: ${report.plPings.length - successPings.length};
mean in ms: ${pingsMean};
median in ms: ${pingsMedian};

Block registry responses:
total: ${report.blockRegistryChecks.length};
successes: ${successRegistryChecks};
errors: ${report.blockRegistryChecks.length - successRegistryChecks};
mean in ms: ${registryMean};
median in ms: ${registryMedian};

Auto-update CDN responses:
total: ${report.autoUpdateCdnChecks.length};
successes: ${successCdnChecks};
errors: ${report.autoUpdateCdnChecks.length - successCdnChecks};
mean in ms: ${cdnMean};
median in ms: ${cdnMedian};

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

function elapsedStat(reports: { elapsedMs: number }[]) {
  const checks = reports.map(p => p.elapsedMs);
  const mean = checks.reduce((sum, p) => sum + p) / checks.length;

  let median = undefined;
  if (checks.length > 0) {
    const mid = Math.floor(checks.length / 2);
    median = checks.length % 2
      ? checks[mid]
      : ((checks[mid - 1] + checks[mid]) / 2);
  }

  return { mean, median };
}

function nowMs(): number {
  return Date.now();
}

function elapsed(startMs: number): number {
  return nowMs() - startMs;
}
