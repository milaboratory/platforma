import { Command } from "commander";
import projectListCommand from "./cmd/project/list";
import projectInfoCommand from "./cmd/project/info";
import projectDuplicateCommand from "./cmd/project/duplicate";
import projectRenameCommand from "./cmd/project/rename";
import projectDeleteCommand from "./cmd/project/delete";
import adminCopyProjectCommand from "./cmd/admin/copy-project";
import adminUserListCommand from "./cmd/admin/user-list";
import adminDeleteUserCommand from "./cmd/admin/delete-user";
import adminInstanceStatsCommand from "./cmd/admin/instance-stats";
import maintenanceListResourcesCommand from "./cmd/maintenance/list-resources";
import maintenanceSetResourceErrorCommand from "./cmd/maintenance/set-resource-error";
import maintenanceControllerListCommand from "./cmd/maintenance/controller/list";
import maintenanceControllerRerunFixupsCommand from "./cmd/maintenance/controller/rerun-fixups";

export function buildProgram(): Command {
  const program = new Command();
  program.name("pl-cli").description("Platforma command-line client");

  const project = new Command("project").description("Manage projects");
  project.addCommand(projectListCommand());
  project.addCommand(projectInfoCommand());
  project.addCommand(projectDuplicateCommand());
  project.addCommand(projectRenameCommand());
  project.addCommand(projectDeleteCommand());
  program.addCommand(project);

  const admin = new Command("admin").description(
    "Admin operations (requires controller credentials)",
  );
  admin.addCommand(adminCopyProjectCommand());
  admin.addCommand(adminUserListCommand());
  admin.addCommand(adminDeleteUserCommand());
  admin.addCommand(adminInstanceStatsCommand());
  program.addCommand(admin);

  const maintenance = new Command("maintenance").description(
    "Low-level server state repair (requires admin/controller credentials)",
  );
  maintenance.addCommand(maintenanceListResourcesCommand());
  maintenance.addCommand(maintenanceSetResourceErrorCommand());
  const controller = new Command("controller").description(
    "Inspect registered controllers and their resources fixups",
  );
  controller.addCommand(maintenanceControllerListCommand());
  controller.addCommand(maintenanceControllerRerunFixupsCommand());
  maintenance.addCommand(controller);
  program.addCommand(maintenance);

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}
