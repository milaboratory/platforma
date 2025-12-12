import { spawn } from 'node:child_process';
import { join } from 'node:path';

export function runCommand(command: string, args: string[], env?: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const prettyeCommand = command.includes('/bin/') ? command.split('/bin/')[1] : command;
    const prettyArgs = args.map((arg) => {
      if (arg.includes(join('tools', 'ts-builder', 'dist'))) {
        return arg.split(join('tools', 'ts-builder', 'dist'))[1];
      }
      return arg;
    });
    console.log(`↳ ${prettyeCommand} ${prettyArgs.join(' ')}`);

    // @TODO: correct parse command file if you want spawn not only Nodejs commands
    const child = spawn(process.execPath, [command, ...args], {
      stdio: 'inherit',
      env: env ? { ...process.env, ...env } : process.env,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with exit code ${code}`));
    });
  });
}

export async function executeCommand(
  command: string,
  args: string[],
  env?: Record<string, string>,
): Promise<void> {
  try {
    await runCommand(command, args, env);
  } catch (error) {
    const message = `Command failed: ${command} ${args.join(' ')}`;
    console.error(message, error);
    process.exit(1);
  }
}
