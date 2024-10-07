export type PlConfigPorts = PlConfigPortsCustom | PlConfigPortsPickFree;

export type PlConfigPortsCustom = {
  type: 'custom';
  grpc: number;
  monitoring: number;
  debug: number;
}

export type PlConfigPortsPickFree = {
  type: 'pickFree';
}

