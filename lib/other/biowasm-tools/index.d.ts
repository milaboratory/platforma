type Mount = File | { name: string; data: Blob | string };

declare class Aioli {
  constructor(tools: string[]);
  mount(mounts: Mount | Mount[]): Promise<void>;
  exec(command: string): Promise<string>;
  cat(filename: string): Promise<string>;
  ls(path: string): Promise<string>;
  // Add any other methods used or known
}
export default Aioli; 