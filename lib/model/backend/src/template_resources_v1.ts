import type { AnyFieldRef, AnyResourceRef } from '@milaboratories/pl-client';
import { field, resourceType } from '@milaboratories/pl-client';
import type * as infoV2 from './template_data_v2';
import type * as infoV3 from './template_data_v3';
export namespace PlTemplateLibV1 {
  export const type = resourceType('TengoLib', '1');

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
        Code: Buffer.from(info.src, 'utf8').toString('base64'),
      },
    };
  }

  export function fromV3Data(info: infoV3.TemplateLibDataV3, sourceCode: string): ResourceStructure {
    return {
      data: {
        Name: info.name,
        Version: info.version,
        Code: Buffer.from(sourceCode, 'utf8').toString('base64'),
      },
    };
  }
}

export namespace PlTemplateSoftwareV1 {
  export const type = resourceType('SoftwareInfo', '1');

  export type ResourceStructure = {
    data: Data;
    name: MetaName;
  };

  /** Raw entrypoint descriptor encoded with Base64 */
  export type Data = string;

  export const metaNameKey = 'ctl/runner/package/name';
  export type MetaName = {
    /** i.e. @milaboratory/some-package:sw1 */
    Name: string;
    /** i.e. 1.2.3 */
    Version: string;
  };

  export function fromV2Data(info: infoV2.TemplateSoftwareData | infoV2.TemplateAssetData): ResourceStructure {
    return {
      data: info.src,
      name: {
        Name: info.name,
        Version: info.version,
      },
    };
  }

  export function fromV3Data(info: infoV3.TemplateSoftwareDataV3, sourceCode: string): ResourceStructure {
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
  export const type = resourceType('TengoTemplate', '1');

  export type ResourceStructure = {
    data: Data;
  };

  export const libPrefix = 'lib';
  export const softPrefix = 'soft';
  export const tplPrefix = 'tpl';

  export function libField(ref: AnyResourceRef, libId: string): AnyFieldRef {
    return field(ref, `${libPrefix}/${libId}`);
  }
  export function tplField(ref: AnyResourceRef, tplId: string): AnyFieldRef {
    return field(ref, `${tplPrefix}/${tplId}`);
  }
  export function swField(ref: AnyResourceRef, softwareId: string): AnyFieldRef {
    return field(ref, `${softPrefix}/${softwareId}`);
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
        Code: Buffer.from(info.src, 'utf8').toString('base64'),
      },
    };
  }

  export function fromV3Data(info: infoV3.TemplateDataV3, sourceCode: string): ResourceStructure {
    return {
      data: {
        Name: info.name,
        Version: info.version,
        Code: Buffer.from(sourceCode, 'utf8').toString('base64'),
      },
    };
  }
}

export namespace PlTemplateOverrideV1 {
  export const type = resourceType('TengoTemplateOverride', '1');

  export type ResourceStructure = {
    data: Data;
  };

  export function tplField(ref: AnyResourceRef): AnyFieldRef {
    return field(ref, 'tpl');
  }

  export type Data = {
    OverrideUUID: string;
  };

  export function fromV2Data(info: infoV2.TemplateData): ResourceStructure {
    if (!info.hashOverride) {
      throw new Error(`template tree rendering error: template has no hash override, cannot generate PlTemplateOverrideV1.ResourceStructure from template data`);
    }

    return {
      data: {
        OverrideUUID: info.hashOverride,
      },
    };
  }

  export function fromV3Data(info: infoV3.TemplateDataV3): ResourceStructure {
    if (!info.hashOverride) {
      throw new Error(`template tree rendering error: template has no hash override, cannot generate PlTemplateOverrideV1.ResourceStructure from template data`);
    }

    return {
      data: {
        OverrideUUID: info.hashOverride,
      },
    };
  }
}
