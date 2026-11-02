/** Gets either manually-selected, random or free ports. */

import { assertNever } from "@milaboratories/ts-helpers";
import type { AddressInfo } from "node:net";
import net from "node:net";

export async function getPorts(opts: PlConfigPorts): Promise<Ports> {
  const t = opts.type;
  switch (t) {
    case "custom":
      return opts.ports;
    case "pickFree":
      return await getFreePorts();
    case "random":
      return getRandomPorts(opts);
    default:
      assertNever(t);
  }
}

export type PlConfigPortsCustom = {
  readonly type: "custom";
  readonly ports: Ports;
};

export type PlConfigPortsRandom = {
  readonly type: "random";
  readonly from: number;
  readonly to: number;
};

export type PlConfigPortsPickFree = {
  readonly type: "pickFree";
};

export type Ports = {
  /** Grpc, http, monitoring and debug ports of Pl Backend. */
  grpc: number;
  http: number;
  monitoring: number;
  debug: number;
};

export type PlConfigPorts = PlConfigPortsCustom | PlConfigPortsRandom | PlConfigPortsPickFree;

async function getFreePorts(): Promise<Ports> {
  return {
    grpc: await getFreePort(),
    http: await getFreePort(),
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
  let http = getPort();
  while (grpc == http || monitoring == http || debug == http) {
    http = getPort();
  }

  return { debug, monitoring, grpc, http };
}
