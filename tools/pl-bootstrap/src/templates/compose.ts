import fs from 'node:fs';
import YAML from 'yaml';

export type VolumeMountOption = {
  hostPath: string;
  containerPath: string;
};

export type ServiceOptions = {
  platform?: string;
  envs?: NodeJS.ProcessEnv;
  mounts?: VolumeMountOption[];
};

type ComposeYamlSpec = {
  services: Record<string, {
    platform?: string;
    environment?: string[];
    volumes?: string[];
  }>;
};

export function render(
  composeSource: string,
  composeDest: string,
  services?: Map<string, ServiceOptions>,
) {
  if (!services || services.size == 0) {
    fs.copyFileSync(composeSource, composeDest);
    return;
  }

  const composeSrcData = fs.readFileSync(composeSource, { encoding: 'utf-8' });
  const compose = YAML.parse(composeSrcData.toString()) as ComposeYamlSpec;

  if (!compose.services) {
    throw new Error(`file '${composeSource}' seems to be not a docker-compose file or has unsupported version`);
  }

  for (const svcName of Object.keys(compose.services)) {
    if (!services.has(svcName)) {
      delete compose.services[svcName];
    }
  }

  for (const [svcName, options] of services.entries()) {
    const svcSpec = compose.services[svcName];

    if (!svcSpec) {
      throw new Error(`docker compose '${composeSource}' has no declaration of service '${svcName}'`);
    }

    if (options.platform) {
      svcSpec.platform = options.platform;
    }

    if (options.envs) {
      if (!svcSpec.environment) {
        svcSpec.environment = [];
      }
      for (let envSpecI = 0; envSpecI < (svcSpec?.environment.length ?? 0);) {
        const envSpec: string = svcSpec.environment[envSpecI];
        const envName = envSpec.split('=')[0];
        if (options.envs[envName]) {
          // Drop env expression from list as we will replace it later by our custom configuration
          const last = svcSpec.environment.pop();

          // Do not insert back last element we just removed.
          if (last && svcSpec.environment.length !== envSpecI) {
            svcSpec.environment[envSpecI] = last;
          }
        } else {
          envSpecI++;
        }
      }

      for (const [envName, envValue] of Object.entries(options.envs)) {
        svcSpec.environment.push(`${envName}=${envValue}`);
      }
    }

    if (options.mounts) {
      if (!svcSpec.volumes) {
        svcSpec.volumes = [];
      }
      for (const mount of options.mounts) {
        svcSpec.volumes.push(`${mount.hostPath}:${mount.containerPath}`);
      }
    }
  }

  fs.writeFileSync(composeDest, YAML.stringify(compose));
}
