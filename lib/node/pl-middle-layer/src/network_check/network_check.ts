/** A utility to check network problems and gather statistics.
 * It's useful when we cannot connect to the server of a company
 * because of security reasons,
 * but they can send us and their DevOps team this report.
 *
 * What we check:
 * - pings to backend
 * - block registry for block overview and ui.
 * - autoupdate CDN.
 * - upload block to backend (workflow part via our API).
 *   - // upload the block part.
 *   - // We could write in workflow-tengo these templates.
 *
 * - the desktop could do multipart upload.
 *   - // get the file handle via ls driver
 *   - // upload, run a template that will make BlobUpload out of it.
 *   - // upload the file
 *
 * - the desktop could download files from S3.
 *   - // get the file handle to the file we just uploaded.
 *   - // make it downloadable via a render template.
 *   - // download the file via download driver.
 *
 * - try to get something from backend's library storage.
 *   - // get the file handle via ls driver
 *   - // download the file via download driver.
 *
 * - backend could download software and run it.
 *   - // run template that will have hello world binary, and get the result.
 *
 * - backend could run python software.
 *   - // run template that will have python software, and get the result.
 *
 * We don't check backend access to S3 storage, it is checked on the start of backend.
 */

import type { PlClientConfig } from '@milaboratories/pl-client';
import { PlClient, UnauthenticatedPlClient, defaultPlClient, plAddressToConfig } from '@milaboratories/pl-client';
import type { MiLogger } from '@milaboratories/ts-helpers';
import { ConsoleLoggerAdapter, HmacSha256Signer } from '@milaboratories/ts-helpers';
import { channel } from 'node:diagnostics_channel';
import type { ClientDownload, ClientUpload } from '@milaboratories/pl-drivers';
import { LsDriver, createDownloadClient, createUploadBlobClient } from '@milaboratories/pl-drivers';
import type { HttpNetworkReport, NetworkReport } from './pings';
import { autoUpdateCdnPings, backendPings, blockGARegistryOverviewPings, blockGARegistryUiPings, blockRegistryOverviewPings, blockRegistryUiPings, reportToString } from './pings';
import type { Dispatcher } from 'undici';
import type { TemplateReport } from './template';
import { uploadTemplate, uploadFile, downloadFile, runDownloadFile, createTempFile } from './template';

/** All reports we need to collect. */
interface NetworkReports {
  plPings: NetworkReport<string>[];

  blockRegistryOverviewChecks: HttpNetworkReport[];
  blockGARegistryOverviewChecks: HttpNetworkReport[];
  blockRegistryUiChecks: HttpNetworkReport[];
  blockGARegistryUiChecks: HttpNetworkReport[];

  autoUpdateCdnChecks: HttpNetworkReport[];

  uploadTemplateCheck: TemplateReport;
  uploadFileCheck: TemplateReport;
  downloadFileCheck: TemplateReport;
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

/** Checks connectivity to Platforma Backend, to block registry
 * and to auto-update CDN,
 * and generates a string report. */
export async function checkNetwork(
  plCredentials: string,
  plUser: string,
  plPassword: string,
  optsOverrides: Partial<CheckNetworkOpts> = {},
): Promise<string> {
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

  const {
    logger,
    plConfig,
    client,
    downloadClient,
    uploadBlobClient,
    lsDriver,
    httpClient,
    ops,
  } = await initNetworkCheck(plCredentials, plUser, plPassword, optsOverrides);

  const { filePath, fileContent } = await createTempFile();

  const report: NetworkReports = {
    plPings: await backendPings(ops, plConfig),
    blockRegistryOverviewChecks: await blockRegistryOverviewPings(ops, httpClient),
    blockGARegistryOverviewChecks: await blockGARegistryOverviewPings(ops, httpClient),
    blockRegistryUiChecks: await blockRegistryUiPings(ops, httpClient),
    blockGARegistryUiChecks: await blockGARegistryUiPings(ops, httpClient),

    autoUpdateCdnChecks: await autoUpdateCdnPings(ops, httpClient),

    uploadTemplateCheck: { ok: false, message: 'not started' },
    uploadFileCheck: { ok: false, message: 'not started' },
    downloadFileCheck: { ok: false, message: 'not started' },
  };

  report.uploadTemplateCheck = await uploadTemplate(client, 'Jack');
  const uploadFileResult = await uploadFile(logger, lsDriver, uploadBlobClient, client, filePath);
  report.uploadFileCheck = uploadFileResult.report;
  report.downloadFileCheck = await downloadFile(client, downloadClient, uploadFileResult.blobId, fileContent);

  return reportsToString(report, plCredentials, ops, undiciLogs);
}

export async function initNetworkCheck(
  plCredentials: string,
  plUser: string,
  plPassword: string,
  optsOverrides: Partial<CheckNetworkOpts> = {},
): Promise<{
    logger: MiLogger;
    plConfig: PlClientConfig;
    client: PlClient;
    downloadClient: ClientDownload;
    uploadBlobClient: ClientUpload;
    lsDriver: LsDriver;
    httpClient: Dispatcher;
    ops: CheckNetworkOpts;
    terminate: () => Promise<void>;
  }> {
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

  const plConfig = plAddressToConfig(plCredentials, { defaultRequestTimeout: ops.pingTimeoutMs });
  const uaClient = new UnauthenticatedPlClient(plConfig);
  const auth = await uaClient.login(plUser, plPassword);
  const client = await PlClient.init(plCredentials, { authInformation: auth });
  const httpClient = uaClient.ll.httpDispatcher;
  const logger = new ConsoleLoggerAdapter();

  // FIXME: do we need to get an actual secret?
  const signer = new HmacSha256Signer('localSecret');

  // We could initialize middle-layer here, but for now it seems like an overkill.
  // Here's the code to do it:
  //
  // const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'platforma-network-check-'));
  // const ml = await MiddleLayer.init(client, tmpDir, {
  //   logger,
  //   localSecret: '',
  //   localProjections: [],
  //   openFileDialogCallback: () => Promise.resolve([]),
  //   preferredUpdateChannel: 'stable',
  // });

  const downloadClient = createDownloadClient(logger, client, []);
  const uploadBlobClient = createUploadBlobClient(client, logger);

  const lsDriver = await LsDriver.init(
    logger,
    client,
    signer,
    [],
    () => Promise.resolve([]),
    [],
  );

  const terminate = async () => {
    downloadClient.close();
    uploadBlobClient.close();
    await httpClient.close();
    await client.close();
  };

  return {
    logger,
    plConfig,
    client,
    downloadClient,
    uploadBlobClient,
    lsDriver,
    httpClient,
    ops,
    terminate,
  };
}

function reportsToString(
  report: NetworkReports,
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
