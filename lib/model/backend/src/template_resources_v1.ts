import type { AnyFieldRef, AnyResourceRef } from "@milaboratories/pl-client";
import { field, resourceType } from "@milaboratories/pl-client";
import type * as infoV2 from "./template_data_v2";
import type * as infoV3 from "./template_data_v3";
export namespace PlTemplateLibV1 {
  export const type = resourceType("TengoLib", "1");

  export type ResourceStructure = {
    data: Data;
  };

  export type Data = {
    /** i.e. @milaboratory/some-package:lib1 */
    Name: string;
    /** i.e. 1.2.3 */
    Version: string;
    /** Full source code encoded with Base64 */
    Code: string;
  };

  export function fromV2Data(info: infoV2.TemplateLibData): ResourceStructure {
    return {
      data: {
        Name: info.name,
        Version: info.version,
        Code: Buffer.from(info.src, "utf8").toString("base64"),
      },
    };
  }

  export function fromV3Data(
    info: infoV3.TemplateLibDataV3,
    sourceCode: string,
  ): ResourceStructure {
    return {
      data: {
        Name: info.name,
        Version: info.version,
        Code: Buffer.from(sourceCode, "utf8").toString("base64"),
      },
    };
  }
}

export namespace PlTemplateSoftwareV1 {
  export const type = resourceType("SoftwareInfo", "1");

  export type ResourceStructure = {
    data: Data;
    name: MetaName;
  };

  /** Raw entrypoint descriptor encoded with Base64 */
  export type Data = string;

  export const metaNameKey = "ctl/runner/package/name";
  export type MetaName = {
    /** i.e. @milaboratory/some-package:sw1 */
    Name: string;
    /** i.e. 1.2.3 */
    Version: string;
  };

  export function fromV2Data(
    info: infoV2.TemplateSoftwareData | infoV2.TemplateAssetData,
  ): ResourceStructure {
    return {
      data: info.src,
      name: {
        Name: info.name,
        Version: info.version,
      },
    };
  }

  export function fromV3Data(
    info: infoV3.TemplateSoftwareDataV3,
    sourceCode: string,
  ): ResourceStructure {
    return {
      data: sourceCode,
      name: {
        Name: info.name,
        Version: info.version,
      },
    };
  }
}

export namespace PlTemplateV1 {
  export const type = resourceType("TengoTemplate", "1");

  export type ResourceStructure = {
    data: Data;
  };

  export const libPrefix = "lib";
  export const softPrefix = "soft";
  export const tplPrefix = "tpl";
  // Must match TengoTemplateFieldWasmPrefix in
  // core/pl/controllers/shared/resources/template_tengo.go.
  export const wasmPrefix = "wasm";

  export function libField(ref: AnyResourceRef, libId: string): AnyFieldRef {
    return field(ref, `${libPrefix}/${libId}`);
  }
  export function tplField(ref: AnyResourceRef, tplId: string): AnyFieldRef {
    return field(ref, `${tplPrefix}/${tplId}`);
  }
  export function swField(ref: AnyResourceRef, softwareId: string): AnyFieldRef {
    return field(ref, `${softPrefix}/${softwareId}`);
  }
  export function wasmField(ref: AnyResourceRef, alias: string): AnyFieldRef {
    return field(ref, `${wasmPrefix}/${alias}`);
  }

  export type Data = {
    /** i.e. @milaboratory/some-package:tpl1 */
    Name: string;
    /** i.e. 1.2.3 */
    Version: string;
    /** Full source code encoded with Base64 */
    Code: string;
  };

  export function fromV2Data(info: infoV2.TemplateData): ResourceStructure {
    return {
      data: {
        Name: info.name,
        Version: info.version,
        Code: Buffer.from(info.src, "utf8").toString("base64"),
      },
    };
  }

  export function fromV3Data(info: infoV3.TemplateDataV3, sourceCode: string): ResourceStructure {
    return {
      data: {
        Name: info.name,
        Version: info.version,
        Code: Buffer.from(sourceCode, "utf8").toString("base64"),
      },
    };
  }
}

export namespace PlWasmV1 {
  export const type = resourceType("Wasm", "1");

  // Must match controllers/shared/resources/wasm.go : WasmRuntimeWasiP2.
  export const runtimeWasiP2 = "wasi-p2";

  // Default per-instance memory cap stamped at resource creation time when
  // the template doesn't carry an explicit value. Mirrors the production
  // controller default at core/pl/controllers/workflow/internal/tplctl/
  // handle_template_pack_convert.go : defaultWasmMemoryLimit (32 MiB).
  export const defaultMemoryLimit = 32 * 1024 * 1024;

  export type ResourceStructure = {
    data: Data;
  };

  // Field names match the WasmV1Data struct in
  // core/pl/controllers/shared/resources/wasm.go. Default Go JSON
  // capitalisation — keep PascalCase.
  export type Data = {
    Name: string;
    Version: string;
    Runtime: string;
    /** Raw wasm component bytes, base64-encoded for JSON transport. */
    Code: string;
    DefaultMemoryLimit: number;
  };

  export function fromV3Data(
    info: infoV3.TemplateWasmDataV3,
    base64Source: string,
  ): ResourceStructure {
    return {
      data: {
        Name: info.name,
        Version: info.version,
        Runtime: runtimeWasiP2,
        // Wasm sources in CompiledTemplateV3.hashToSource are already
        // base64-encoded by tengo-builder (see addWasmFile in
        // tools/tengo-builder/src/compiler/main.ts).
        Code: base64Source,
        DefaultMemoryLimit: defaultMemoryLimit,
      },
    };
  }
}

export namespace PlTemplateOverrideV1 {
  export const type = resourceType("TengoTemplateOverride", "1");

  export type ResourceStructure = {
    data: Data;
  };

  export function tplField(ref: AnyResourceRef): AnyFieldRef {
    return field(ref, "tpl");
  }

  export type Data = {
    OverrideUUID: string;
  };

  export function fromV2Data(info: infoV2.TemplateData): ResourceStructure {
    if (!info.hashOverride) {
      throw new Error(
        `template tree rendering error: template has no hash override, cannot generate PlTemplateOverrideV1.ResourceStructure from template data`,
      );
    }

    return {
      data: {
        OverrideUUID: info.hashOverride,
      },
    };
  }

  export function fromV3Data(info: infoV3.TemplateDataV3): ResourceStructure {
    if (!info.hashOverride) {
      throw new Error(
        `template tree rendering error: template has no hash override, cannot generate PlTemplateOverrideV1.ResourceStructure from template data`,
      );
    }

    return {
      data: {
        OverrideUUID: info.hashOverride,
      },
    };
  }
}
