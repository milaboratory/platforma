import type { Plugin, ViteDevServer } from 'vite';
import { build } from 'vite';
import path from 'path';

// Experimental plugin to watch dependencies and trigger Electron reload
export function BuildAndWatchDepsPlugin(depsToWatch: string[]): Plugin {
  // List of relative paths to dependencies
  let hasStartedWatchers = false;

  console.log('[plugin] Plugin initialized with dependencies:', depsToWatch);

  async function setupDependencyWatcher(depPath: string, server: ViteDevServer) {
    const absPath = path.resolve(__dirname, depPath);
    const viteConfigPath = path.join(absPath, 'vite.config.ts');

    console.log(`[plugin] Setting up watcher for ${depPath} at ${absPath}, viteConfigPath: ${viteConfigPath}`);

    return build({
      configFile: viteConfigPath,
      mode: 'development',
      logLevel: 'warn',
      build: {
        // Enable rollup watcher
        watch: {},
      },
      plugins: [
        {
          name: 'reload-page-on-dependency-change',
          writeBundle() {
            console.log(`[plugin] Dependency ${depPath} rebuilt, triggering Electron reload`);

            // Send custom message to trigger Electron reload
            server.ws.send({
              type: 'custom',
              event: 'electron-dep-reload',
              data: { depPath },
            });
          },
        },
      ],
    }).then((watcher) => {
      console.log(`[plugin] Watcher set up successfully for ${depPath}`);
      return watcher;
    });
  }

  // Client-side reload handler code
  const hmrCode = `
// Auto-injected Electron reload handler
if (import.meta.hot) {
  console.log('[Auto-HMR] Electron reload handler injected by plugin');
  
  // Function to reload in Electron
  function reloadElectron() {
    console.log('[Auto-HMR] Triggering Electron reload...');
    try {
      // Try the working method you found
      if (window.__devApi?.reload) {
        console.log('[Auto-HMR] Using __devApi.reload()');
        window.__devApi.reload();
        return;
      }
    } catch (e) {
      console.log('[Auto-HMR] __devApi.reload() failed:', e);
    }
    
    // Fallback methods
    try {
      if (window.history) {
        console.log('[Auto-HMR] Using history.go(0)');
        window.history.go(0);
        return;
      }
    } catch (e) {
      console.log('[Auto-HMR] history.go(0) failed:', e);
    }
    
    console.log('[Auto-HMR] All reload methods failed');
  }
  
  // Listen for dependency reload events
  import.meta.hot.on('electron-dep-reload', (data) => {
    console.log('[Auto-HMR] Dependency reload event received:', data);
    reloadElectron();
  });
  
  // Also handle standard full reload events
  import.meta.hot.on('vite:beforeFullReload', () => {
    console.log('[Auto-HMR] Vite full reload event received');
    reloadElectron();
  });
}
`;

  return {
    name: 'vite-plugin-build-and-watch-deps',

    async configureServer(server) {
      // Only set up watchers once when the server is configured
      if (hasStartedWatchers) return;
      hasStartedWatchers = true;

      console.log('[plugin] Setting up dependency watchers...');

      // Set up watchers for all dependencies
      const watchers = await Promise.all(
        depsToWatch.map((dep) => setupDependencyWatcher(dep, server)),
      );

      console.log(`[plugin] All ${watchers.length} dependency watchers are active`);

      // Clean up watchers when server is closed
      server.httpServer?.on('close', () => {
        console.log('[plugin] Cleaning up dependency watchers...');
        watchers.forEach((watcher) => {
          if (watcher && 'close' in watcher && typeof watcher.close === 'function') {
            (watcher as { close: () => void }).close();
          }
        });
      });
    },

    // Inject HMR code into the main entry point
    transform(code, id) {
      // Only inject into the main entry file
      if (id.includes('/src/main.ts') || id.includes('/src/main.js')) {
        console.log('[plugin] Injecting HMR code into main entry:', id);
        return {
          code: code + '\n' + hmrCode,
          map: null,
        };
      }
    },
  };
}
