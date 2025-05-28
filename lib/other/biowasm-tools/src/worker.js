import { expose } from "comlink";
import { simd } from "wasm-feature-detect";

const LOADING_EAGER = "eager";
const LOADING_LAZY = "lazy";
const LOADING_DONE = "done"; // Added this to track when a module is fully initialized

// Hardcode wasm features to avoid downloading a "config.json" for every tool.
// As a result, adding a SIMD package to biowasm requires updating Aioli, but
// there are very few packages that will require that.
const WASM_FEATURES = {
	"ssw": ["simd"],
	"minimap2": ["simd"]
};

// Main Aioli logic
const aioli = {
	// State
	tools: [],   // Tools that are available to use in this WebWorker
	config: {},  // See main.js for defaults
	files: [],   // File/Blob objects that represent local user files we mount to a virtual filesystem
	base: {},    // Base module (e.g. aioli.tools[0]; not always [0], see init())
	fs: {},      // Base module's filesystem (e.g. aioli.tools[0].module.FS)
	id: Math.random().toString(36).substring(2, 15), // Unique ID for this worker instance for logging

	// =========================================================================
	// Initialize the WebAssembly module(s)
	// Supports array of tool info, where each tool is represented by:
	// 		{
	// 			tool: "samtools",                             // Required
	// 			version: "1.10",                              // Required
	// 			program: "samtools",                          // Optional, default="tool" name. Only use this for tools with multiple subtools
	// 			urlPrefix: "https://cdn.biowasm.com/v3/...",  // Optional, default=biowasm CDN. Only use for local biowasm development
	// 			loading: "eager",                             // Optional, default="eager". Set to "lazy" to only load modules when they are used in exec()
	// 			reinit: false,                                // Optional, default="false". Set to "true" to reinitialize a module after each invocation
	//      embeddedAssets: { js: "...", wasm: ArrayBuffer } // Optional, for embedding assets directly
	// 		},
	// =========================================================================
	async init() {
		// Expect at least 1 module
		if(aioli.tools.length === 0)
			throw "Expecting at least 1 tool.";

		// Detect duplicate modules
		const toolsUnique = new Set(aioli.tools.map(t => `${t.tool}/${t.program || t.tool}`));
		if(toolsUnique.size !== aioli.tools.length)
			throw "Found duplicate tools; can only have each tool/program combination at most once.";

		// The base module cannot be reinitializable since we rely on its filesystem
		// to be stable (can remount files explicitly mounted via Aioli, but can't
		// remount files created by a tool). Try to find tool matching this criteria.
		aioli.base = aioli.tools.find(t => t.reinit !== true);
		if(!aioli.base)
			throw "Could not find a tool with `reinit: false` to use as the base module. To fix this issue, include the tool `base/1.0.0` when initializing Aioli.";
		aioli.base.isBaseModule = true;

		// Set up base module first so that its filesystem is ready for the other
		// modules to mount in parallel
		await this._setup(aioli.base);
		// Assign base filesystem
		if (aioli.base.module && aioli.base.module.FS) {
			aioli.fs = aioli.base.module.FS;
		} else {
			this._log("Error: Base module's filesystem (FS) not available after setup.");
			throw "Base module filesystem initialization failed.";
		}


		// Initialize all other modules
		await this._initModules();
		this._log("Ready");
		return true;
	},

	// Initialize all modules that should be eager-loaded (i.e. not lazy-loaded)
	async _initModules() {
		// Initialize WebAssembly modules in parallel
		await Promise.all(aioli.tools.map(tool => this._setup(tool)));

		// Setup filesystems so that tools can access each other's sample data
		await this._setupFS();
	},

	// =========================================================================
	// Mount files to the virtual file system
	// =========================================================================
	mount(files=[]) {
		const dirData = `${this.config.dirShared}${this.config.dirData}`.replace(/\/\/+/g, '/'); // Normalize path
		const dirMounted = `${this.config.dirShared}${this.config.dirMounted}`.replace(/\/\/+/g, '/'); // Normalize path
		let toMountFiles = [], toMountURLs = [], mountedPaths = [];

		if(!this.fs || Object.keys(this.fs).length === 0) {
			this._log("File system not initialized. Cannot mount files.");
			return [];
		}

		// Input validation: auto convert singletons to array for convenience
		if(!Array.isArray(files) && !(files instanceof FileList))
			files = [ files ];
		this._log(`Mounting ${files.length} files`);

		// Sort files by type: File vs. Blob vs. URL
		for(let file of files) {
			if(file instanceof File || (file?.data instanceof Blob && file.name) || (typeof file?.data === "string" && file.name)) {
				if(typeof file?.data === "string")
					file.data = new Blob([ file.data ], { type: "text/plain" });
				toMountFiles.push(file);
			} else if(file.name && file.url) {
				toMountURLs.push(file);
			} else if(typeof file == "string" && file.startsWith("http")) {
				file = { url: file, name: file.split("//").pop().replace(/\//g, "-") };
				toMountURLs.push(file);
			} else {
				throw `Cannot mount file(s) specified. Must be a File, Blob, a URL string, or { name: "file.txt", data: "string" }.`;
			}
			mountedPaths.push(file.name);
		}

		try {
			this.fs.unmount(dirMounted);
		} catch(e) {}
		
		try {
			this.fs.mkdirTree(dirData); // Ensure dirData exists
			this.fs.mkdirTree(dirMounted); // Ensure dirMounted exists
		} catch(e) {
			this._log(`Error creating directories ${dirData} or ${dirMounted}: ${e}`);
		}


		for(let file of toMountURLs)
			this.fs.createLazyFile(dirData, file.name, file.url, true, true);

		this.files = this.files.concat(toMountFiles);
		this.fs.mount(this.base.module.WORKERFS, {
			files: this.files.filter(f => f instanceof File),
			blobs: this.files.filter(f => f?.data instanceof Blob)
		}, dirMounted);

		toMountFiles.map(file => {
			const oldpath = `${dirMounted}/${file.name}`.replace(/\/\/+/g, '/');
			const newpath = `${dirData}/${file.name}`.replace(/\/\/+/g, '/');
			try {
				this.fs.unlink(newpath);
			} catch(e) {}
			this._log(`Creating symlink: ${newpath} --> ${oldpath}`)
			this.fs.symlink(oldpath, newpath);
		});

		return mountedPaths.map(path => `${dirData}/${path}`.replace(/\/\/+/g, '/'));
	},

	// =========================================================================
	// Execute a command
	// =========================================================================
	async exec(command, args=null) {
		this._log(`Executing %c${command}%c args=${args}`, "color:darkblue; font-weight:bold", "");
		if(!command)
			throw "Expecting a command";
		
		let toolName = command;
		if(args == null) {
			args = command.trim().split(/ +/); 
			toolName = args.shift();
		}

		const tool = aioli.tools.find(t => {
			let tmpToolName = toolName;
			if(t?.features?.simd === true) // This was t?.features?.simd, ensure it is checked correctly.
				tmpToolName = `${tmpToolName}-simd`;
			return t.program == tmpToolName;
		});
		if(tool == null)
			throw `Program ${toolName} not found.`;
		
		tool.stdout = "";
		tool.stderr = "";

		if(tool.loading == LOADING_LAZY) {
			tool.loading = LOADING_EAGER; // Mark for loading
			await this._setup(tool); // Load it now
		} else if (tool.loading !== LOADING_DONE) {
			this._log(`Tool ${tool.tool} is still in loading state ${tool.loading}. Waiting for it to complete.`);
			await this._setup(tool); // Ensure it's loaded if it wasn't fully done.
		}


		try {
			tool.module.callMain(args);
		} catch (error) {
			console.error(error);
			// If error is ExitStatus, it's already handled by onExit
			if (!(error.name === "ExitStatus")) {
				tool.stderr += `\nError during execution: ${error.message ? error.message : error.toString()}`;
			}
		}

		try {
			tool.module.FS.close( tool.module.FS.streams[1] );
			tool.module.FS.close( tool.module.FS.streams[2] );
		} catch (error) {}
		
		tool.module.FS.streams[1] = tool.module.FS.open("/dev/stdout", "w");
		tool.module.FS.streams[2] = tool.module.FS.open("/dev/stderr", "w");

		let result = { stdout: tool.stdout, stderr: tool.stderr };
		if(this.config.printInterleaved) // Access config via this.config
			result = tool.stdout;

		if(tool.reinit === true) {
			await this.reinit(tool.tool);
		}

		return result;
	},

	// =========================================================================
	// Utility functions for common file operations
	// =========================================================================
	cat(path) {
		return this._fileop("cat", path);
	},

	ls(path) {
		return this._fileop("ls", path);
	},

	download(path) {
		return this._fileop("download", path);
	},

	downloadBlob(path) { 
		return this._fileop("downloadBlob", path);
	},

	pwd() {
		if(!this.fs || Object.keys(this.fs).length === 0) return "/";
		return this.fs.cwd();
	},

	cd(path) {
		if(!this.fs || Object.keys(this.fs).length === 0) return;
		for(let tool of aioli.tools) {
			const module = tool.module;
			if(!module || !module.FS)
				continue;
			module.FS.chdir(path);
		}
	},

	mkdir(path) {
		if(!this.fs || Object.keys(this.fs).length === 0) return false;
		this.fs.mkdir(path);
		return true;
	},

	read({ path, length, flag="r", offset=0, position=0 }) {
		if(!this.fs || Object.keys(this.fs).length === 0) return new Uint8Array();
		const stream = this.fs.open(path, flag);
		const buffer = new Uint8Array(length);
		this.fs.read(stream, buffer, offset, length, position);
		this.fs.close(stream);
		return buffer;
	},

	write({ path, buffer, flag="w+", offset=0, position=0 }) {
		if(!this.fs || Object.keys(this.fs).length === 0) return;
		const stream = this.fs.open(path, flag);
		this.fs.write(stream, buffer, offset, buffer.length, position);
		this.fs.close(stream);
	},

	// =========================================================================
	// Reinitialize a tool
	// =========================================================================
	async reinit(toolName) {
		const tool = aioli.tools.find(t => t.tool == toolName);
		if (!tool) {
			this._log(`Tool ${toolName} not found for reinitialization.`);
			return;
		}
		const pwd = (this.fs && Object.keys(this.fs).length > 0) ? this.fs.cwd() : "/";

		Object.assign(tool, tool.config); // Reset to original config
		tool.isInitialized = false;
		tool.loading = LOADING_EAGER; // Mark for eager loading
		// tool.ready = false; // This property was used before, replaced by loading state

		await this._setup(tool); // Re-initialize the specific tool

		// If reinitialized the base module, need to re-assign aioli.fs and remount
		if(tool.isBaseModule) {
			if (tool.module && tool.module.FS) {
				aioli.fs = tool.module.FS;
			} else {
				this._log(`Error: Base module's filesystem (FS) not available after re-setup.`);
				throw "Base module filesystem re-initialization failed.";
			}
			this.mount(); // Remount files if any
		}
		
		if (this.fs && Object.keys(this.fs).length > 0) {
			this.cd(pwd);
		}
	},

	// =========================================================================
	// Close the worker
	// =========================================================================
	async close() {
		this._log("Closing worker...");
		self.close();
	},

	// =========================================================================
	// Stdin management
	// =========================================================================
	_stdinTxt: "",
	_stdinPtr: 0,
	get stdin() {
		return this._stdinTxt;
	},
	set stdin(txt = "") {
		this._log(`Setting stdin to %c${txt}%c`, "color:darkblue", "");
		this._stdinTxt = txt;
		this._stdinPtr = 0;
	},

	// =========================================================================
	// Initialize a tool
	// =========================================================================
	async _setup(tool) {
		// If already initialized or currently initializing, skip
		if (tool.loading === LOADING_DONE || tool.isInitializing) {
			if(tool.isInitializing) this._log(`Tool ${tool.tool} setup already in progress.`);
			return;
		}
		tool.isInitializing = true; // Mark that setup has started

		this._log(`Initializing ${tool.tool}...`);
		this._log(`Worker this.config:`, this.config);
		this._log(`Worker this.config.localToolsBasePath:`, this.config.localToolsBasePath);

		const basePath = this.config.localToolsBasePath || ".";
		let urlPrefix = tool.urlPrefix || `${basePath}/${tool.tool}/${tool.version}`;
		urlPrefix = urlPrefix.replace(/\/\/$/, ''); // Remove trailing slash if any

		let jsUrl = tool.urlJs || `${urlPrefix}/${tool.program}.js`;
		let wasmUrl = tool.urlWasm || `${urlPrefix}/${tool.program}.wasm`;
		
		if(tool.simd) {
			const simdSupported = await simd();
			if(simdSupported) {
				wasmUrl = tool.urlWasmSimd || `${urlPrefix}/${tool.program}.simd.wasm`;
				if(!tool.urlJs)
					jsUrl = tool.urlJsSimd || `${urlPrefix}/${tool.program}.simd.js`;
				this._log(`Using SIMD version for ${tool.program}. JS: ${jsUrl}, WASM: ${wasmUrl}`);
			} else {
				if(this.config.debug) {
					this._log(`WebAssembly SIMD is not supported; will load non-SIMD version of ${tool.program}.`);
				}
			}
		}

		if(tool.isBaseModule && tool.loading !== LOADING_EAGER) { // Base module must be eager
			tool.loading = LOADING_EAGER;
		}
		if(tool.loading === LOADING_LAZY) {
			this._log(`Will lazy-load ${tool.tool}; skipping initialization for now.`);
			tool.isInitializing = false; // Reset initializing flag
			return;
		}

		const moduleConfig = {
			thisProgram: tool.program,
			locateFile: (path, prefix) => {
				const wasmFileName = tool.program + (tool.simd && tool.urlWasmSimd && wasmUrl.includes(".simd.wasm") ? ".simd.wasm" : ".wasm");
				if (path === wasmFileName || path === "kalign.wasm") { // Adding kalign.wasm as it's hardcoded in its JS
					this._log(`moduleConfig.locateFile: WASM request for "${path}", returning configured: "${wasmUrl}"`);
					return wasmUrl;
				}
				const resolvedPath = `${urlPrefix}/${path}`;
				this._log(`moduleConfig.locateFile: Auxiliary file "${path}", resolving to: "${resolvedPath}"`);
				return resolvedPath;
			},
			stdin: () => {
				if(this._stdinPtr < this._stdinTxt.length) // Use this._stdinTxt
					return this._stdinTxt.charCodeAt(this._stdinPtr++);
				else {
					this._stdinTxt = ""; // Reset for next use
					this._stdinPtr = 0;
					return null;
				}
			},
			print: text => {
				if(this.config.printStream) {
					postMessage({ type: "stdout", id: this.id, data: text });
				}
				tool.stdout += `${text}\n`;
			},
			printErr: text => {
				if(this.config.printStream) {
					postMessage({ type: "stderr", id: this.id, data: text });
				}
				tool.stderr += `${text}\n`;
			},
			noExitRuntime: true,
			onRuntimeInitialized: () => {
				const fs = tool.module.FS;
				const dirSharedNorm = this.config.dirShared.replace(/\/\/+/g, '/');
				const dirOutputNorm = this.config.dirOutput.replace(/\/\/+/g, '/');
				
				try {
					fs.stat(dirSharedNorm);
				} catch (e) {
					fs.mkdirTree(dirSharedNorm);
				}
				try {
					fs.stat(dirOutputNorm);
				} catch (e) {
					fs.mkdirTree(dirOutputNorm);
				}

				// Mount any pre-existing shared files from base FS if this is not the base module
				if (!tool.isBaseModule && this.fs && Object.keys(this.fs).length > 0) {
					try {
						const sharedItems = this.fs.readdir(dirSharedNorm);
						fs.mkdirTree(dirSharedNorm); // Ensure target exists in this module's FS
						for (const item of sharedItems) {
							if (item === "." || item === "..") continue;
							const itemPathInBase = `${dirSharedNorm}/${item}`.replace(/\/\/+/g, '/');
							const itemPathInTool = `${dirSharedNorm}/${item}`.replace(/\/\/+/g, '/');
							if (this.fs.isDir(this.fs.stat(itemPathInBase).mode)) {
								fs.mkdirTree(itemPathInTool);
								// Potentially mount if it's a separate FS, or deep copy
							} else if (this.fs.isFile(this.fs.stat(itemPathInBase).mode)) {
								const data = this.fs.readFile(itemPathInBase);
								fs.writeFile(itemPathInTool, data);
							}
						}
					} catch(e) {
						this._log(`Error syncing shared files to ${tool.tool}: ${e}`);
					}
				}


				fs.chdir(dirOutputNorm);
				this._log(`${tool.tool} initialized! CWD: ${fs.cwd()}`);
			},
			onExit: status => {
				if(this.config.debug)
					this._log(`Program ${tool.program} exited with status ${status}`);
			}
		};

		if (tool.embeddedAssets && typeof tool.embeddedAssets.js === 'string' && tool.embeddedAssets.wasm instanceof ArrayBuffer) {
			this._log(`Loading ${tool.tool} from embedded assets.`);
			
			const preEvalLocateFile = (path, scriptDir) => {
				const wasmFileName = tool.program + (tool.simd && tool.urlWasmSimd && wasmUrl.includes(".simd.wasm") ? ".simd.wasm" : ".wasm");
				// Handle kalign.js specifically asking for "kalign.wasm"
				if (path === "kalign.wasm" || path === wasmFileName) {
					this._log(`preEvalModule.locateFile: WASM request for "${path}", returning as-is (will be picked from wasmBinary).`);
					return path; // Emscripten uses this as a key if wasmBinary is present
				}
				const auxiliaryFileUrlPrefix = tool.urlPrefix || `${this.config.localToolsBasePath || "."}/${tool.tool}/${tool.version}`.replace(/\/\/$/, '');
				const resolvedAuxPath = `${auxiliaryFileUrlPrefix}/${path}`;
				this._log(`preEvalModule.locateFile: resolving auxiliary "${path}" to "${resolvedAuxPath}"`);
				return resolvedAuxPath;
			};

			self.Module = {
				wasmBinary: tool.embeddedAssets.wasm,
				locateFile: preEvalLocateFile
				// Any other overrides from original kalign.js/tool.js should be preserved if it pre-defines Module
			};

			try {
				// Use importScripts with a Data URL as a more secure alternative to eval
				const dataUrl = `data:application/javascript,${encodeURIComponent(tool.embeddedAssets.js)}`;
				importScripts(dataUrl);
			} catch (e) {
				this._log(`Error executing embedded JS (via importScripts) for ${tool.tool}: ${e}`);
				tool.isInitializing = false; // Reset initializing flag
				throw e;
			}
			
			const factoryConfig = {
				...moduleConfig, 
				wasmBinary: tool.embeddedAssets.wasm, 
				locateFile: (path, scriptDir) => { 
					const wasmFileName = tool.program + (tool.simd && tool.urlWasmSimd && wasmUrl.includes(".simd.wasm") ? ".simd.wasm" : ".wasm");
					if (path === "kalign.wasm" || path === wasmFileName) {
						this._log(`FactoryModule.locateFile: WASM request for "${path}", returning as-is.`);
						return path; 
					}
					return moduleConfig.locateFile(path, scriptDir);
				}
			};
			tool.module = await self.Module(factoryConfig);

		} else {
			this._log(`Loading ${tool.tool} from URL: ${jsUrl}`);
			self.importScripts(jsUrl);
			tool.module = await self.Module(moduleConfig);
		}

		tool.isInitialized = true;
		tool.loading = LOADING_DONE;
		tool.isInitializing = false; // Reset initializing flag
		if (tool.isBaseModule) { // After base module fully initialized
			this.fs = tool.module.FS;
		}
	},

	// =========================================================================
	// _setupFS: Mount every tool's sample data onto the base module
	// =========================================================================
	async _setupFS() {
		if(!this.fs || Object.keys(this.fs).length === 0) {
			this._log("Base filesystem not available. Skipping _setupFS.");
			return;
		}
		const fsDst = this.fs;
		const dirSharedNorm = this.config.dirShared.replace(/\/\/+/g, '/');

		for(let tool of this.tools) {
			if(!tool.isInitialized || !tool.module || !tool.module.FS)
				continue;

			const fsSrc = tool.module.FS;
			// Standard biowasm tools often have an example folder named after the tool inside the FS root
			const pathSrcInsideToolFS = `/${tool.tool}`; 
			const pathDstInBaseFS = `${dirSharedNorm}/${tool.tool}`.replace(/\/\/+/g, '/');

			try {
				if(!fsSrc.analyzePath(pathSrcInsideToolFS).exists) {
					this._log(`No example data path "${pathSrcInsideToolFS}" found in ${tool.tool}'s filesystem. Skipping mount for it.`);
					continue;
				}
				if(fsDst.analyzePath(pathDstInBaseFS).exists) {
					this._log(`Path "${pathDstInBaseFS}" already exists in base filesystem. Skipping mount for ${tool.tool}.`);
					continue;
				}
			} catch (e) { 
				this._log(`Skipping FS setup for ${tool.tool} due to path analysis issue: ${e}`);
				continue;
			}

			this._log(`Mounting ${tool.tool}'s data from its "${pathSrcInsideToolFS}" to base FS at "${pathDstInBaseFS}"`);
			try {
				fsDst.mkdirTree(pathDstInBaseFS.substring(0, pathDstInBaseFS.lastIndexOf('/'))); // Ensure parent dir exists
				fsDst.mkdir(pathDstInBaseFS); // Create mount point
				fsDst.mount(tool.module.PROXYFS, { // Use PROXYFS from the source tool's module
					root: pathSrcInsideToolFS,
					fs: fsSrc
				}, pathDstInBaseFS);
			} catch (e) {
				this._log(`Error mounting ${pathSrcInsideToolFS} for ${tool.tool} at ${pathDstInBaseFS}: ${e}`);
			}
		}
	},
	
	// =========================================================================
	// _fileop: Common file operations
	// =========================================================================
	_fileop(operation, path) {
		this._log(`Running ${operation} ${path}`);
		if(!this.fs || Object.keys(this.fs).length === 0) {
			this._log("No initialized FS found for file operation");
			return false;
		}
		const fs = this.fs; // Always use the base filesystem

		try {
			fs.stat(path);
		} catch (e) {
			this._log(`File/directory ${path} not found for operation ${operation}.`);
			return false;
		}

		switch (operation) {
			case "cat":
				if (!fs.isFile(fs.stat(path).mode)) {
					this._log(`Error: ${path} is not a file. Cannot 'cat'.`);
					return false;
				}
				return fs.readFile(path, { encoding: "utf8" });

			case "ls":
				const stat = fs.stat(path);
				if(fs.isFile(stat.mode))
					return { name: path.split('/').pop(), size: stat.size, mode: stat.mode, isFile: true, isDir: false };
				if(fs.isDir(stat.mode)) {
					const entries = fs.readdir(path);
					return entries.map(entry => {
						if (entry === "." || entry === "..") return null;
						try {
							const entryStat = fs.stat(`${path}/${entry}`.replace(/\/\/+/g, '/'));
							return { name: entry, size: entryStat.size, mode: entryStat.mode, isFile: fs.isFile(entryStat.mode), isDir: fs.isDir(entryStat.mode) };
						} catch (e) {
							return { name: entry, error: "Error stating entry" };
						}
					}).filter(e => e !== null);
				}
				return { name: path.split('/').pop(), error: "Not a file or directory" };


			case "download":
				const catResult = this._fileop("cat", path);
				if (catResult === false) return false;
				const blob = new Blob([catResult]);
				return URL.createObjectURL(blob);

			case "downloadBlob":
				if (!fs.isFile(fs.stat(path).mode)) {
					this._log(`Error: ${path} is not a file. Cannot download blob.`);
					return false;
				}
				const fileData = fs.readFile(path); // Returns Uint8Array
				return new Blob([fileData]); 
		}
		return false;
	},

	// Log if debug enabled
	_log(message /*, ...args*/) { // Spread operator for args not needed if using arguments
		if(!this.config.debug) 
			return;

		let argsToLog = Array.from(arguments); // Convert arguments to a real array
		argsToLog.shift(); // Remove the message itself, as it's formatted separately

		console.log(`%c[AioliWorker-${this.id}]%c ${message}`, "font-weight:bold", "", ...argsToLog);
	}
};

expose(aioli);