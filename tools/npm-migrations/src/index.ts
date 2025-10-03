import fs from 'node:fs';
import path from 'node:path';

export type Migration = () => void | Promise<void>;

export class Migrator {
  private readonly packageName: string;
  private readonly projectRoot: string;
  private readonly onFirstInstall: 'apply-all' | 'skip-all';
  private migrations: Migration[] = [];

  constructor(packageName: string, opts?: {
    projectRoot?: string;
    onFirstInstall?: 'apply-all' | 'skip-all';
  }) {
    this.packageName = packageName;
    this.projectRoot = opts?.projectRoot ?? (process.env.INIT_CWD || process.cwd());
    this.onFirstInstall = opts?.onFirstInstall ?? 'skip-all';
  }

  public addMigration(...migrations: Migration[]): void {
    this.migrations.push(...migrations);
  }

  public async applyMigrations(): Promise<void> {
    const pkg = this.readPackageJsonObj();
    pkg.migrations = pkg.migrations ?? {};

    const pkgMigrationValue = pkg.migrations[this.packageName];
    const nextToApply: number | null = Number.isInteger(pkgMigrationValue) ? pkgMigrationValue : null;

    // If no record: set to latest immediately, do NOT run migrations
    if (nextToApply === null && this.onFirstInstall === 'skip-all') {
      pkg.migrations[this.packageName] = this.migrations.length;
      this.writePackageJsonObj(pkg);
      return;
    }

    // Apply pending migrations one-by-one
    let toApply = nextToApply ?? 0;
    while (toApply < this.migrations.length) {
      const migration = this.migrations[toApply];
      await migration?.();

      const oldID = toApply;
      const newID = toApply + 1;
      toApply++;

      pkg.migrations[this.packageName] = newID;

      // Update version preserving formatting if possible
      if (this.updateMigrationVersion(oldID, newID)) {
        continue;
      }
      this.writePackageJsonObj(pkg);
    }
  }

  private readPackageJson(): string {
    const p = path.resolve(this.projectRoot, 'package.json');
    return fs.readFileSync(p, 'utf8');
  }

  private writePackageJson(text: string): void {
    const p = path.resolve(this.projectRoot, 'package.json');
    fs.writeFileSync(p, text, 'utf8');
  }

  private readPackageJsonObj(): { migrations?: Record<string, number> } {
    const txt = this.readPackageJson();
    const obj: unknown = JSON.parse(txt);
    return (obj && typeof obj === 'object' ? (obj as { migrations?: Record<string, number> }) : { }) as {
      migrations?: Record<string, number>;
    };
  }

  private writePackageJsonObj(obj: { migrations?: Record<string, number> }): void {
    const txt = JSON.stringify(obj, null, 2) + '\n';
    this.writePackageJson(txt);
  }

  /**
   * @param v - last applied migration
   * @returns true if package migration string was found in package.json
   */
  private updateMigrationVersion(from: number, to: number): boolean {
    const text = this.readPackageJson();
    const newline = text.includes('\r\n') ? '\r\n' : '\n';

    const migBlockRe = /("migrations"\s*:\s*\{)([\s\S]*?)(\n*\s*\})/s;
    const m = text.match(migBlockRe);
    if (!m || m.index == null) return false;

    const blockStart = m[1];
    const inner = m[2];
    const blockEnd = m[3];

    const pkgKey = `"${this.packageName}"`;

    const innerLines = inner.split(newline);

    let found = false;
    for (const [i, line] of innerLines.entries()) {
      if (!line.includes(pkgKey)) {
        continue;
      }

      found = true;

      const keyPos = line.indexOf(pkgKey);
      const colonPos = line.indexOf(':', keyPos + pkgKey.length);
      if (colonPos === -1) {
        return false;
      }

      const keyPart = line.slice(0, colonPos + 1);
      const valuePart = line.slice(colonPos + 1);
      const newValuePart = valuePart.replace(new RegExp(`${from}(\\s*[},]|$)`), `${to}$1`);

      innerLines[i] = keyPart + newValuePart;
    }

    const newInner = innerLines.join(newline);
    if (newInner === inner) return found;

    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    const updated = before + blockStart + newInner + blockEnd + after;
    this.writePackageJson(updated);

    return found;
  }
}
