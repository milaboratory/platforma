/** A utility to check network problems and gather statistics.
 * It's useful when we cannot connect to the server of a company
 * because of security reasons,
 * but they can send us and their DevOps team this report.
 *
 * What we check:
 * - pings to backend
 * - block registry for block overview and ui.
 * - autoupdate CDN.
 * - upload workflow to backend (workflow part via our API).
 * - the desktop could do multipart upload.
 * - the desktop could download files from S3.
 * - backend could download software and run it.
 * - backend could run python software.
 * TODO:
 * - try to get something from backend's library storage.
 *
 * We don't check backend access to S3 storage, it is checked on the start of backend.
 */

import type { AuthInformation, PlClientConfig } from '@milaboratories/pl-client';
import { PlClient, UnauthenticatedPlClient, plAddressToConfig } from '@milaboratories/pl-client';
import type { MiLogger } from '@milaboratories/ts-helpers';
import { ConsoleLoggerAdapter, HmacSha256Signer } from '@milaboratories/ts-helpers';
import { channel } from 'node:diagnostics_channel';
import type { ClientDownload, ClientUpload } from '@milaboratories/pl-drivers';
import { LsDriver, createDownloadClient, createUploadBlobClient } from '@milaboratories/pl-drivers';
import type { HttpNetworkReport, NetworkReport } from './pings';
import { autoUpdateCdnPings, backendPings, blockGARegistryOverviewPings, blockGARegistryUiPings, blockRegistryOverviewPings, blockRegistryUiPings, reportToString } from './pings';
import type { Dispatcher } from 'undici';
import type { TemplateReport } from './template';
import { uploadTemplate, uploadFile, downloadFile, createTempFile, pythonSoftware, softwareCheck, createBigTempFile, downloadFromEveryStorage } from './template';

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
  softwareCheck: TemplateReport;
  pythonSoftwareCheck: TemplateReport;
  storageToDownloadReport: Record<string, TemplateReport>;
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

  /** Body limit for requests. */
  bodyLimit: number;

  /** Limit for the size of files to download from every storage. */
  everyStorageBytesLimit: number;
  /** Minimal size of files to download from every storage. */
  everyStorageMinFileSize: number;
  /** Maximal size of files to download from every storage. */
  everyStorageMaxFileSize: number;
  /** How many files to download from every storage. */
  everyStorageNFilesToCheck: number;
}

/** Checks connectivity to Platforma Backend, to block registry
 * and to auto-update CDN,
 * and generates a string report. */
export async function checkNetwork(
  plCredentials: string,
  plUser: string | undefined,
  plPassword: string | undefined,
  optsOverrides: Partial<CheckNetworkOpts> = {},
): Promise<string> {
  const undiciLogs: any[] = [];
  // Subscribe to all Undici diagnostic events
  undiciEvents.forEach((event) => {
    const diagnosticChannel = channel(event);
    diagnosticChannel.subscribe((message: any) => {
      const timestamp = new Date().toISOString();
      const data = { ...message };
      if (data?.response?.headers) {
        data.response = { ...data.response };
        data.response.headers = data.response.headers.slice();
        data.response.headers = data.response.headers.map((h: any) => h.toString());
      }

      // we try to upload big files, don't include the buffer in the report.
      if (data?.request?.body) {
        data.request = { ...data.request };
        data.request.body = `too big`;
      }

      undiciLogs.push(
        JSON.stringify({
          timestamp,
          event,
          data,
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

  const { filePath: filePathToDownload, fileContent: fileContentToDownload } = await createTempFile();
  const { filePath: filePathToUpload } = await createBigTempFile();

  const report: NetworkReports = {
    plPings: await backendPings(ops, plConfig),
    blockRegistryOverviewChecks: await blockRegistryOverviewPings(ops, httpClient),
    blockGARegistryOverviewChecks: await blockGARegistryOverviewPings(ops, httpClient),
    blockRegistryUiChecks: await blockRegistryUiPings(ops, httpClient),
    blockGARegistryUiChecks: await blockGARegistryUiPings(ops, httpClient),

    autoUpdateCdnChecks: await autoUpdateCdnPings(ops, httpClient),

    uploadTemplateCheck: await uploadTemplate(logger, client, 'Jack'),
    uploadFileCheck: await uploadFile(logger, lsDriver, uploadBlobClient, client, filePathToUpload),
    downloadFileCheck: await downloadFile(logger, client, lsDriver, uploadBlobClient, downloadClient, filePathToDownload, fileContentToDownload),
    softwareCheck: await softwareCheck(client),
    pythonSoftwareCheck: await pythonSoftware(client, 'Jack'),
    storageToDownloadReport: await downloadFromEveryStorage(
      logger,
      client,
      lsDriver,
      downloadClient,
      {
        bytesLimit: ops.everyStorageBytesLimit,
        minFileSize: ops.everyStorageMinFileSize,
        maxFileSize: ops.everyStorageMaxFileSize,
        nFilesToCheck: ops.everyStorageNFilesToCheck,
      },
    ),
  };

  return reportsToString(report, plCredentials, ops, undiciLogs);
}

export async function initNetworkCheck(
  plCredentials: string,
  plUser: string | undefined,
  plPassword: string | undefined,
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

    everyStorageBytesLimit: 1024,
    everyStorageMinFileSize: 1024,
    everyStorageMaxFileSize: 10 * 1024 * 1024,
    everyStorageNFilesToCheck: 100,
    ...optsOverrides,
  };

  const plConfig = plAddressToConfig(plCredentials, {
    defaultRequestTimeout: ops.pingTimeoutMs,
  });

  // exposing alternative root for fields not to interfere with
  // projects of the user.
  plConfig.alternativeRoot = `check_network_${Date.now()}`;

  const uaClient = new UnauthenticatedPlClient(plConfig);

  let auth: AuthInformation = {};
  if (plUser && plPassword) {
    auth = await uaClient.login(plUser, plPassword);
  }

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

  const summary = (ok: boolean) => ok ? 'OK' : 'FAILED';

  const pings = reportToString(report.plPings);
  const blockRegistryOverview = reportToString(report.blockRegistryOverviewChecks);
  const blockGARegistryOverview = reportToString(report.blockGARegistryOverviewChecks);
  const blockRegistryUi = reportToString(report.blockRegistryUiChecks);
  const blockGARegistryUi = reportToString(report.blockGARegistryUiChecks);
  const autoUpdateCdn = reportToString(report.autoUpdateCdnChecks);

  const storagesSummary = Object.entries(report.storageToDownloadReport)
    .map(([storage, report]) => `${summary(report.ok)} ${storage} storage check`).join('\n');

  return `
Network report:
pl endpoint: ${plEndpoint};

summary:
${summary(pings.ok)} pings to Platforma Backend
${summary(blockRegistryOverview.ok)} block registry overview
${summary(blockGARegistryOverview.ok)} block ga registry overview
${summary(blockRegistryUi.ok)} block registry ui
${summary(blockGARegistryUi.ok)} block ga registry ui
${summary(autoUpdateCdn.ok)} auto-update CDN
${summary(report.uploadTemplateCheck.ok)} upload template
${summary(report.uploadFileCheck.ok)} upload file
${summary(report.downloadFileCheck.ok)} download file
${summary(report.softwareCheck.ok)} software check
${summary(report.pythonSoftwareCheck.ok)} python software check
${storagesSummary}

details:
options: ${JSON.stringify(opts, null, 2)}.

Upload template response: ${report.uploadTemplateCheck.message}

Upload file response: ${report.uploadFileCheck.message}

Download file response: ${report.downloadFileCheck.message}

Software check response: ${report.softwareCheck.message}
Python software check response: ${report.pythonSoftwareCheck.message}
Platforma pings: ${pings.details}

Block registry overview responses: ${blockRegistryOverview.details}

Block ga registry overview responses: ${blockGARegistryOverview.details}

Block registry ui responses: ${blockRegistryUi.details}

Block ga registry ui responses: ${blockGARegistryUi.details}

Auto-update CDN responses: ${autoUpdateCdn.details}

Storage to download responses: ${JSON.stringify(report.storageToDownloadReport, null, 2)}

dumps:
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
