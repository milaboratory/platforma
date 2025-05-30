import { wrap } from "comlink";
import AioliWorker from "./worker?worker&inline";

// Import Kalign assets
import kalignJsContent from './tools/kalign/3.3.1/kalign.js?raw';
// For WASM, import as URL and then fetch as ArrayBuffer
import kalignWasmUrl from './tools/kalign/3.3.1/kalign.wasm?url';

// Constants
const CONFIG_DEFAULTS = {
	// localToolsBasePath is relative to the document origin when worker is inlined
	// Still relevant if other tools are loaded remotely.
	localToolsBasePath: "./tools",

	// Folder to use for mounting the shared filesystem
	dirShared: "/shared",
	// Folder to use for mounting File/Blob objects to the virtual file system
	dirMounted: "/mnt",
	// Folder to use for symlinks
	dirData: "/data",
	// Interleave stdout/stderr
	printInterleaved: true,
	// Stream stdout/stderr
	printStream: false,
	// Callback function
	callback: null,
	// Debugging
	debug: false
};

// Pre-fetch and store the WASM ArrayBuffer
let kalignWasmAB = null;
async function getKalignWasmAB() {
	if (kalignWasmAB === null) {
		const response = await fetch(kalignWasmUrl);
		kalignWasmAB = await response.arrayBuffer();
	}
	return kalignWasmAB;
}

// Class: 1 object = 1 worker
export default class Aioli {
	constructor(tools, config = {}) {
		if (tools == null)
			throw "Expecting array of tools as input to Aioli constructor.";

		// Parse user input
		if (!Array.isArray(tools))
			tools = [tools];
		// Overwrite default config if specified
		this.config = Object.assign({}, CONFIG_DEFAULTS, config); // Assign to this.config early

		// Process tools, potentially substituting "kalign" string with full embedded config
		// This is now an async operation due to fetching WASM
		this._initializeTools = async () => {
			this.tools = await Promise.all(tools.map(tool => this._parseTool(tool)));

			// Handle callback (delete it because we can't send a function to the WebWorker)
			if (this.config.callback != null) {
				this.callback = this.config.callback;
				// Ensure config passed to worker doesn't have the callback
				this.config = { ...this.config }; // Clone to avoid modifying original if shared
				delete this.config.callback;
			}
		};

		// The constructor itself cannot be async in the typical way to await _initializeTools.
		// So, we make init responsible for completing this setup.
		// The return this.init() pattern remains, but init will await _initializeTools.
		return this.init();
	}

	// Initialize the WebWorker and the WebAssembly modules within it
	async init() {
		// Ensure tools are parsed and WASM is fetched before proceeding
		if (typeof this._initializeTools === 'function') {
			await this._initializeTools();
			delete this._initializeTools; // Remove after execution
		}

		// Create the WebWorker
		const worker = new AioliWorker();

		// Listen for "biowasm" messages from the WebWorker
		if(this.callback)
			worker.onmessage = e => {
				if(e.data.type === "biowasm") // Ensure this matches worker's postMessage structure
					this.callback(e.data.value); // Ensure this matches worker's postMessage structure
			};

		const aioli = wrap(worker);
		// Pass the processed tools and config to the worker
		aioli.tools = this.tools;
		aioli.config = this.config;

		// Initialize the tools inside the WebWorker
		await aioli.init();

		return aioli;
	}

	// Parse "<tool>/<version>" and "<tool>/<program>/<version>" into { "tool": <tool>, "program": <program>, "version": <version> }
	// Or, if "kalign", return the embedded configuration.
	async _parseTool(tool) {
		// If it's the "kalign" string, provide the embedded configuration
		if (tool === "kalign") {
			const wasmAB = await getKalignWasmAB();
			return {
				tool: "kalign",
				program: "kalign", // Assuming default program name
				version: "3.3.1",  // Specify the version you're embedding
				simd: false, // Explicitly false as we are embedding specific files. Adjust if you embed SIMD.
				embeddedAssets: {
					js: kalignJsContent,
					wasm: wasmAB,
				}
			};
		}

		// If not a string, leave it as is (assuming it's already a valid tool object)
		if(typeof tool !== "string")
			return tool;

		// Support "<tool>/<version>" and "<tool>/<program>/<version>" for other tools
		const toolSplit = tool.split("/");
		if(toolSplit.length != 2 && toolSplit.length != 3)
			throw "Expecting '<tool>/<version>' or '<tool>/<program>/<version>' or a pre-configured tool name like 'kalign'";

		return {
			tool: toolSplit[0],
			program: toolSplit.length == 3 ? toolSplit[1] : toolSplit[0],
			version: toolSplit[toolSplit.length - 1]
		};
	}

	// =========================================================================
	// Filesystem operations
	// =========================================================================
	async cat(path) {
		return this.worker.cat(path);
	}

	async ls(path) {
		return this.worker.ls(path);
	}
}
