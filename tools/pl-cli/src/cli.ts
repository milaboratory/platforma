import { Command } from "commander";
import projectListCommand from "./cmd/project/list";
import projectInfoCommand from "./cmd/project/info";
import projectDuplicateCommand from "./cmd/project/duplicate";
import projectRenameCommand from "./cmd/project/rename";
import projectDeleteCommand from "./cmd/project/delete";
import adminCopyProjectCommand from "./cmd/admin/copy-project";

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
  program.addCommand(admin);

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}
