/** Gets either manually-selected, random or free ports, converts them to localhost or other endpoints.
 * Optionally returns minio ports as well. */

import { assertNever } from '@milaboratories/ts-helpers';
import type { AddressInfo } from 'net';
import net from 'net';

/** Gets ports according to options, and concatenated them with the host. */
export async function getLocalhostEndpoints(opts: PlConfigPorts): Promise<Endpoints> {
  return withHost('127.0.0.1', '127.0.0.1', await getPorts(opts));
}

export async function getPorts(opts: PlConfigPorts): Promise<Ports> {
  const t = opts.type;
  switch (t) {
    case 'custom':
      return opts.ports;
    case 'customWithMinio':
      return opts.ports;
    case 'pickFree':
      return await getFreePorts();
    case 'random':
      return getRandomPorts(opts);
    default:
      assertNever(t);
  }
}

export type PlConfigPortsCustom = {
  readonly type: 'custom';
  readonly ports: Ports;
};

export type PlConfigPortsCustomWithMinio = {
  readonly type: 'customWithMinio';
  readonly ports: PortsWithMinio;
};

export type PlConfigPortsRandom = {
  readonly type: 'random';
  readonly from: number;
  readonly to: number;
};

export type PlConfigPortsPickFree = {
  readonly type: 'pickFree';
};

export type Ports = {
  /** Grpc, monitoring and debug ports of Pl Backend. */
  grpc: number;
  monitoring: number;
  debug: number;

  // the following fields are not empty only when the client provided them at creation.

  minio?: number;
  minioConsole?: number;

  grpcLocal?: number;
  minioLocal?: number;
};

export type Endpoints = {
  grpc: string;
  monitoring: string;
  debug: string;

  // the following fields are not empty only when the client provided them at creation.

  minio?: string;
  minioConsole?: string;

  grpcLocal?: string;
  minioLocal?: string;
};

export type PortsWithMinio = {
  grpc: number;
  monitoring: number;
  debug: number;

  minio: number;
  minioConsole: number;

  grpcLocal: number;
  minioLocal: number;
};

export type PlConfigPorts =
  | PlConfigPortsCustom
  | PlConfigPortsCustomWithMinio
  | PlConfigPortsRandom
  | PlConfigPortsPickFree;

async function getFreePorts(): Promise<Ports> {
  return {
    grpc: await getFreePort(),
    monitoring: await getFreePort(),
    debug: await getFreePort(),
  };
}

export async function getFreePort(): Promise<number> {
  return new Promise((res) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as AddressInfo).port;
      srv.close((_) => res(port));
    });
  });
}

function getRandomPorts(opts: PlConfigPortsRandom): Ports {
  const getRandomInt = (from: number, to: number) => from + Math.floor(Math.random() * (to - from));
  const getPort = () => getRandomInt(opts.from, opts.to);

  const grpc = getPort();
  let monitoring = getPort();
  while (grpc == monitoring) {
    monitoring = getPort();
  }
  let debug = getPort();
  while (grpc == debug || monitoring == debug) {
    debug = getPort();
  }

  return { debug, monitoring, grpc };
}

/** Turns ports to endpoints by adding host */
export function withHost(host: string, localHost: string, ports: Ports): Endpoints {
  const endp = (host: string, port: number) => `${host}:${port}`;

  return {
    // Platforma Backend can't parse these endpoints when the protocol is provided.
    grpc: endp(host, ports.grpc),
    monitoring: endp(host, ports.monitoring),
    debug: endp(host, ports.debug),

    minio: ports.minio ? endp(host, ports.minio) : undefined,
    minioConsole: ports.minioConsole ? endp(host, ports.minioConsole) : undefined,

    grpcLocal: ports.grpcLocal ? endp(localHost, ports.grpcLocal) : undefined,
    minioLocal: ports.minioLocal ? endp(localHost, ports.minioLocal) : undefined,
  };
}
