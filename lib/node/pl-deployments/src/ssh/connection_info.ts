/** We store all info about the connection on the server,
 * so that another client could read the file and connect from another machine. */
import * as v from "valibot";

//
// Types
//

export const PortPair = v.looseObject({
  local: v.number(),
  remote: v.number(),
});
/** The pair of ports for forwarding. */
export type PortPair = v.InferOutput<typeof PortPair>;

export const SshPlPorts = v.looseObject({
  grpc: PortPair,
  http: v.optional(PortPair),
  monitoring: PortPair,
  debug: PortPair,
  /** @deprecated */
  minioPort: PortPair,
  /** @deprecated */
  minioConsolePort: PortPair,
});
/** All info about ports that are forwarded. */
export type SshPlPorts = v.InferOutput<typeof SshPlPorts>;

export const ConnectionInfo = v.looseObject({
  plUser: v.string(),
  plPassword: v.string(),
  ports: SshPlPorts,

  // It's false by default because it was added later,
  // and in some deployments there won't be useGlobalAccess flag in the file.
  useGlobalAccess: v.optional(v.boolean(), false),

  // We added the field afterwards, the pl backend was this version.
  plVersion: v.optional(v.string(), "1.18.3"),

  // It's true by default because it was added later and previous installation use minio.
  minioIsUsed: v.optional(v.boolean(), true),
});
/** The content of the file that holds all the info about the connection on the remote server. */
export type ConnectionInfo = v.InferOutput<typeof ConnectionInfo>;

//
// Funcs
//

export function newConnectionInfo(
  plUser: string,
  plPassword: string,
  ports: SshPlPorts,
  useGlobalAccess: boolean,
  plVersion: string,
  minioIsUsed: boolean,
): ConnectionInfo {
  return {
    plUser,
    plPassword,
    ports,
    useGlobalAccess,
    plVersion,
    minioIsUsed: minioIsUsed,
  };
}

export function parseConnectionInfo(content: string): ConnectionInfo {
  return v.parse(ConnectionInfo, JSON.parse(content));
}

export function stringifyConnectionInfo(conn: ConnectionInfo): string {
  return JSON.stringify(conn, undefined, 2);
}
