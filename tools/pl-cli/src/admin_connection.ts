import {
  PlClient,
  UnauthenticatedPlClient,
  plAddressToConfig,
  type AuthInformation,
  type PlClientConfig,
  type ResourceId,
  isNullResourceId,
} from "@milaboratories/pl-client";
import { createHash } from "node:crypto";

export interface AdminConnectionOptions {
  address: string;
  adminUser: string;
  adminPassword: string;
}

/** Creates a PlClient with admin/controller credentials. */
export async function createAdminPlConnection(opts: AdminConnectionOptions): Promise<PlClient> {
  const config: PlClientConfig = plAddressToConfig(opts.address);

  const unauth = await UnauthenticatedPlClient.build(config);
  const authInformation: AuthInformation = await unauth.login(opts.adminUser, opts.adminPassword);

  return await PlClient.init(config, { authInformation });
}

const ProjectsField = "projects";

/**
 * Navigates to a specific user's project list resource ID.
 * Computes SHA256(username) to find the user's root, then reads the "projects" field.
 *
 * @returns the ResourceId of the user's project list, or undefined if the user has no projects yet
 */
export async function navigateToUserRoot(
  pl: PlClient,
  username: string,
): Promise<{ userRoot: ResourceId; projectListRid: ResourceId }> {
  const rootName = createHash("sha256").update(username).digest("hex");

  return await pl.withReadTx("navigateToUserRoot", async (tx) => {
    if (!(await tx.checkResourceNameExists(rootName))) {
      throw new Error(`User "${username}" not found on this server (no root resource).`);
    }

    const userRootRid = await tx.getResourceByName(rootName);

    const projectsFieldData = await tx.getField({
      resourceId: userRootRid,
      fieldName: ProjectsField,
    });

    if (isNullResourceId(projectsFieldData.value)) {
      throw new Error(`User "${username}" has no project list.`);
    }

    return { userRoot: userRootRid, projectListRid: projectsFieldData.value };
  });
}
