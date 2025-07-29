# Resource Exhaustion and Concurrency Issues

This document lists potential resource exhaustion, memory leaks, and concurrency issues that could manifest under high load in the pl-drivers codebase.

## ⚠️ High Priority Issues

### 1. File Descriptor Exhaustion in `ClientDownload.readLocalFile()` 
**File:** `src/clients/download.ts:65-77`
**Risk:** High - File descriptor exhaustion under concurrent load

```typescript
async readLocalFile(url: string, fromBytes?: number, toBytes?: number): Promise<DownloadResponse> {
  const { storageId, relativePath } = parseLocalUrl(url);
  const fullPath = getFullPath(storageId, this.localStorageIdsToRoot, relativePath);

  return {
    content: Readable.toWeb(fs.createReadStream(fullPath, { start: fromBytes, end: toBytes !== undefined ? toBytes - 1 : undefined })),
    size: (await fsp.stat(fullPath)).size,
  };
}
```

**Problem:** Creates `fs.createReadStream()` without concurrency limiting or explicit cleanup. Under high load with thousands of concurrent calls, this will exhaust file descriptors.

**Impact:** 
- EMFILE: too many open files errors
- System instability
- Service degradation

**Solution:** 
- Add concurrency limiting (similar to `readFileContent` pattern)
- Implement proper stream cleanup in error cases
- Add resource monitoring

### 2. File Stream Resource Leak in `getLastLines()`
**File:** `src/drivers/download_blob/download_blob.ts:661-684`
**Risk:** Medium-High - File descriptor leaks on errors

```typescript
function getLastLines(fPath: string, nLines: number, patternToSearch?: string): Promise<string> {
  const inStream = fs.createReadStream(fPath);  // ❌ No cleanup on rejection
  const outStream = new Writable();

  return new Promise((resolve, reject) => {
    const rl = readline.createInterface(inStream, outStream);
    rl.on('error', reject);  // ❌ Stream not explicitly closed on error
    // ...
  });
}
```

**Problem:** 
- Creates read stream without explicit cleanup in error cases
- If promise is rejected, file descriptor may leak
- No concurrency limiting for multiple simultaneous calls

**Impact:**
- File descriptor accumulation over time
- Memory leaks from unclosed streams
- Potential system resource exhaustion

**Solution:**
- Add try/catch with explicit stream cleanup
- Implement concurrency limiting
- Use proper error handling patterns

## 🔍 Medium Priority Issues

### 3. Unbounded Map Growth Potential
**Files:** Multiple drivers with Map-based caches
**Risk:** Medium - Memory exhaustion from unbounded cache growth

**Locations:**
- `DownloadDriver.keyToDownload: Map<string, DownloadBlobTask>`
- `DownloadDriver.keyToOnDemand: Map<string, OnDemandBlobHolder>`
- `DownloadDriver.idToLastLines: Map<string, LastLinesGetter>`
- `DownloadDriver.idToProgressLog: Map<string, LastLinesGetter>`

**Assessment:** **PARTIALLY MITIGATED** ✅
- Download driver has proper cleanup in `releaseBlob()` and `removeTask()`
- However, other drivers should be audited for similar patterns

**Monitoring Needed:**
- Map size monitoring in production
- Memory usage alerts
- Cleanup effectiveness metrics

### 4. Polling Loop Resource Accumulation
**Files:** 
- `src/drivers/logs_stream.ts:285-314`
- `src/drivers/upload.ts:195-218`

**Risk:** Medium - Resource accumulation in polling loops

```typescript
private async mainLoop() {
  while (this.keepRunning) {
    const logs = this.getAllLogs();  // Creates new array each iteration
    await asyncPool(
      this.opts.nConcurrentGetLogs,
      logs.map((getter) => async () => await getter.update()),  // New array/functions
    );
    // ...
  }
}
```

**Potential Issues:**
- Memory allocation on each polling cycle
- Accumulation of failed requests without cleanup
- No circuit breaker for continuous failures

**Solution:**
- Implement circuit breaker patterns
- Add failure rate monitoring
- Consider request deduplication

## 📋 Lower Priority Issues

### 5. Write Stream Creation Without Explicit Cleanup
**File:** `src/drivers/download_blob_url/task.ts:127`
**Risk:** Low-Medium - Potential resource leaks on errors

```typescript
const f = Writable.toWeb(fs.createWriteStream(this.state!.zipPath));
await content.pipeTo(f, { signal });
```

**Assessment:** Likely handled by `pipeTo()` cleanup, but should be verified.

### 6. Sparse File Operations Concurrency
**File:** `src/drivers/download_blob/sparse_cache/file.ts:46-48`
**Risk:** Low - File handle exhaustion under high concurrency

```typescript
const fileHandle = await fs.open(path, 'r+');
await fileHandle.write(data, 0, data.length, from);
await fileHandle.close();
```

**Assessment:** Proper cleanup exists, but no concurrency limiting.

## ✅ Well-Handled Areas

### Good Patterns Found:
1. **Upload file operations** (`src/clients/upload.ts:164-180`) - Proper try/finally with file handle cleanup
2. **Download blob driver cleanup** - Comprehensive resource cleanup in `releaseBlob()` and `removeTask()`
3. **Sparse file creation** - Proper file handle management with cleanup
4. **HTTP operations** - Using undici with proper connection pooling

## 🛡️ Recommended Mitigations

### Immediate Actions:
1. **Fix `ClientDownload.readLocalFile()`** - Add concurrency limiting and proper cleanup
2. **Fix `getLastLines()`** - Add explicit stream cleanup and error handling
3. **Add resource monitoring** - File descriptor and memory usage alerts

### Medium-term Actions:
1. **Audit all Map-based caches** - Ensure proper cleanup mechanisms
2. **Implement circuit breakers** - For polling operations and external calls
3. **Add load testing** - Specifically for file operations under high concurrency
4. **Resource metrics** - Monitoring for file descriptors, memory, and connection pools

### Long-term Actions:
1. **Resource budget enforcement** - Global limits on concurrent operations
2. **Graceful degradation** - Fallback mechanisms when resource limits are approached
3. **Performance profiling** - Regular analysis of resource usage patterns

## 🧪 Testing Recommendations

### Load Testing Scenarios:
1. **File descriptor exhaustion test** - Thousands of concurrent file reads
2. **Memory stress test** - Long-running operations with large caches
3. **Error resilience test** - Network failures during polling operations
4. **Resource cleanup test** - Verify cleanup after abrupt terminations

### Monitoring Metrics:
- Open file descriptors count
- Memory usage per driver
- Cache sizes (Map entries)
- Failed request rates
- Resource cleanup success rates
