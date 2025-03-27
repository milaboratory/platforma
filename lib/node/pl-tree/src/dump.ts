import { ExtendedResourceData } from "./state"

export type ResourceStats = {
    /** Number of resources of this type */
    count: number,
    /** Total number of bytes in the field names of all resources of this type */
    fieldNameBytes: number,
    /** Total number of fields in all resources of this type */
    fieldsCount: number,
    /** Total number of bytes in the data of all resources of this type */
    dataBytes: number,
    /** Total number of key-value records in all resources of this type */
    kvCount: number,
    /** Total number of bytes in the key-value records of all resources of this type */
    kvBytes: number,
}

/**
 * A map of resource type statistics, keyed by the resource type name and version.
 * 
 * @type {Record<string, ResourceStats>}
 */
export type TreeDumpStats = {
    total: ResourceStats,
    byResourceType: Record<`${string}/${string}`, ResourceStats>
}

/**
 * Analyzes a collection of resources and generates statistics grouped by resource type.
 * 
 * This function processes an array of ExtendedResourceData and calculates various metrics
 * for each unique resource type, including:
 * - Count of resources
 * - Total bytes in field names
 * - Total number of fields
 * - Total bytes in resource data
 * - Total number of key-value records
 * - Total bytes in key-value records
 * 
 * The statistics are organized by resource type using a key in the format "typeName/version".
 * 
 * @param dumpStats - Array of ExtendedResourceData objects to analyze
 * @returns A DumpStats object containing statistics for each resource type
 * @example
 * ```typescript
 * const resources = [...]; // Array of ExtendedResourceData
 * const stats = treeDumpStats(resources);
 * // stats = {
 * //   "MyResource/1": {
 * //     count: 5,
 * //     fieldNameBytes: 150,
 * //     fieldsCount: 10,
 * //     dataBytes: 1024,
 * //     kvCount: 3,
 * //     kvBytes: 256
 * //   },
 * //   ...
 * // }
 * ```
 */
export function treeDumpStats(dumpStats: ExtendedResourceData[]): TreeDumpStats {
    const stats: TreeDumpStats = {
        total: {
            count: 0,
            fieldNameBytes: 0,
            fieldsCount: 0,
            dataBytes: 0,
            kvCount: 0,
            kvBytes: 0
        },
        byResourceType: {}
    };

    for (const resource of dumpStats) {
        const typeKey = `${resource.type.name}/${resource.type.version}` as const;
        if (!stats.byResourceType[typeKey]) {
            stats.byResourceType[typeKey] = {
                count: 0,
                fieldNameBytes: 0,
                fieldsCount: 0,
                dataBytes: 0,
                kvCount: 0,
                kvBytes: 0
            };
        }

        const typeStats = stats.byResourceType[typeKey];
        typeStats.count++;
        stats.total.count++;

        for (const field of resource.fields) {
            typeStats.fieldNameBytes += field.name.length;
            typeStats.fieldsCount++;
            stats.total.fieldNameBytes += field.name.length;
            stats.total.fieldsCount++;
        }

        if (resource.data) {
            const dataLength = resource.data?.length ?? 0;
            typeStats.dataBytes += dataLength;
            stats.total.dataBytes += dataLength;
        }

        typeStats.kvCount += resource.kv.length;
        stats.total.kvCount += resource.kv.length;
        
        for (const kv of resource.kv) {
            const kvLength = kv.key.length + kv.value.length;
            typeStats.kvBytes += kvLength;
            stats.total.kvBytes += kvLength;
        }
    }

    return stats;
}