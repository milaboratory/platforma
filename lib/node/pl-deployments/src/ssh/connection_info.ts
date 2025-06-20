/** We store all info about the connection on the server,
 * so that another client could read the file and connect from another machine. */
import { z } from 'zod';

//
// Types
//

export const PortPair = z.object({
  local: z.number(),
  remote: z.number(),
});
/** The pair of ports for forwarding. */
export type PortPair = z.infer<typeof PortPair>;

export const SshPlPorts = z.object({
  grpc: PortPair,
  http: PortPair.optional(),
  monitoring: PortPair,
  debug: PortPair,
  /** @deprecated */
  minioPort: PortPair,
  /** @deprecated */
  minioConsolePort: PortPair,
});
/** All info about ports that are forwarded. */
export type SshPlPorts = z.infer<typeof SshPlPorts>;

export const ConnectionInfo = z.object({
  plUser: z.string(),
  plPassword: z.string(),
  ports: SshPlPorts,

  // It's false by default because it was added later,
  // and in some deployments there won't be useGlobalAccess flag in the file.
  useGlobalAccess: z.boolean().default(false),

  // We added the field afterwards, the pl backend was this version.
  plVersion: z.string().default('1.18.3'),

  // It's true by default because it was added later and previous installation use minio.
  minioIsUsed: z.boolean().default(true),
});
/** The content of the file that holds all the info about the connection on the remote server. */
export type ConnectionInfo = z.infer<typeof ConnectionInfo>;

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
  return ConnectionInfo.parse(JSON.parse(content));
}

export function stringifyConnectionInfo(conn: ConnectionInfo): string {
  return JSON.stringify(conn, undefined, 2);
}
