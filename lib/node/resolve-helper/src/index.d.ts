export type ResolveError = "MODULE_NOT_FOUND" | "ERR_PACKAGE_PATH_NOT_EXPORTED";

export type ResolveResultOrError = {
    result: string;
} | {
    result?: undefined;
    err: ResolveError;
}

export declare function tryResolveOrError(root: string, request: string): ResolveResultOrError;
export declare function tryResolve(root: string, request: string): string | undefined;
