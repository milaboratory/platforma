import { assertNever } from '@milaboratories/ts-helpers';

export type Ports = {
  grpc: number;
  monitoring: number;
  debug: number;
};

export type Endpoints = {
  grpc: string;
  monitoring: string;
  debug: string;
};

export type PlConfigPorts =
  | PlConfigPortsCustom
  | PlConfigPortsRandom
  | PlConfigPortsPickFree;

export type PlConfigPortsCustom = {
  type: 'custom';
  ports: Ports;
};

export type PlConfigPortsRandom = {
  type: 'random';
  from: number;
  to: number;
};

export type PlConfigPortsPickFree = {
  type: 'pickFree';
};

export async function getPorts(opts: PlConfigPorts): Promise<Ports> {
  const t = opts.type;
  switch (t) {
    case 'custom':
      return opts.ports;
    case 'pickFree':
      throw new Error('todo: implement');
    case 'random':
      return getRandomPorts(opts);
    default:
      assertNever(t);
  }
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

export function withLocalhost(ports: Ports): Endpoints {
  return {
    grpc: `127.0.0.1:${ports.grpc}`,
    monitoring: `127.0.0.1:${ports.monitoring}`,
    debug: `127.0.0.1:${ports.debug}`
  };
}
