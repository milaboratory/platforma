import { Command } from "commander";
import createBlockCommand from "./commands/create-block";
import resetCommand from "./commands/reset";
import stopCommand from "./commands/stop";
import startCommand from "./commands/start";
import startDockerCommand from "./commands/start/docker";
import startDockerS3Command from "./commands/start/docker/s3";
import startLocalCommand from "./commands/start/local";
import startLocalS3Command from "./commands/start/local/s3";
import svcUpCommand from "./commands/svc/up";
import svcDownCommand from "./commands/svc/down";
import svcListCommand from "./commands/svc/list";
import svcDeleteCommand from "./commands/svc/delete";
import svcCreateDockerCommand from "./commands/svc/create/docker";
import svcCreateDockerS3Command from "./commands/svc/create/docker/s3";
import svcCreateLocalCommand from "./commands/svc/create/local";
import svcCreateLocalS3Command from "./commands/svc/create/local/s3";

export function buildProgram(): Command {
  const program = new Command();
  program.name("pl-dev").description("Platforma development service manager");

  program.addCommand(createBlockCommand());
  program.addCommand(resetCommand());
  program.addCommand(stopCommand());

  // `start` is runnable (= start last) and the parent of its storage variants.
  const start = startCommand();
  const startDocker = startDockerCommand();
  startDocker.addCommand(startDockerS3Command());
  start.addCommand(startDocker);
  const startLocal = startLocalCommand();
  startLocal.addCommand(startLocalS3Command());
  start.addCommand(startLocal);
  program.addCommand(start);

  const svc = new Command("svc").description("Manage named service instances");
  svc.addCommand(svcUpCommand());
  svc.addCommand(svcDownCommand());
  svc.addCommand(svcListCommand());
  svc.addCommand(svcDeleteCommand());

  const svcCreate = new Command("create").description("Create a new service instance");
  const svcCreateDocker = svcCreateDockerCommand();
  svcCreateDocker.addCommand(svcCreateDockerS3Command());
  svcCreate.addCommand(svcCreateDocker);
  const svcCreateLocal = svcCreateLocalCommand();
  svcCreateLocal.addCommand(svcCreateLocalS3Command());
  svcCreate.addCommand(svcCreateLocal);
  svc.addCommand(svcCreate);

  program.addCommand(svc);

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}
