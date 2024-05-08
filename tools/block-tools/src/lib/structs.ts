export interface PackageOverviewEntry {
  version: string,
  meta: object
}

export type PackageOverview = PackageOverviewEntry[]

export interface GlobalOverviewEntry {
  organization: string,
  package: string,
  latestVersion: string,
  latestMeta: object
}

export type GlobalOverview = GlobalOverviewEntry[]
