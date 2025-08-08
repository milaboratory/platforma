import { spawn } from 'child_process';

export function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const prettyeCommand = command.includes('/bin/') ? command.split('/bin/')[1] : command;
    const prettyArgs = args.map(arg => {
      if (arg.includes('/tools/ts-builder/dist/')) {
        return arg.split('/tools/ts-builder/dist/')[1];
      }
      return arg;
    });
    console.log(`↳ ${prettyeCommand} ${prettyArgs.join(' ')}`);

    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

export async function executeCommand(
  command: string, 
  args: string[], 
  successMessage?: string,
  errorMessage?: string
): Promise<void> {
  try {
    await runCommand(command, args);
    if (successMessage) {
      console.log(successMessage);
    }
  } catch (error) {
    const message = errorMessage || `Command failed: ${command} ${args.join(' ')}`;
    console.error(message, error);
    process.exit(1);
  }
}
