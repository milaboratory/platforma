import winston from 'winston';
import { PackageInfo } from '../core/package-info';
import { SoftwareDescriptor, allSoftwareSources, softwareSource } from '../core/sw-json';
import { BuildMode } from '../core/flags';
import * as util from '../core/util';
import * as archive from '../core/archive';


function packageInfo(logger: winston.Logger, pkgRoot?: string, pkgInfo?: PackageInfo): PackageInfo {
    if (pkgInfo) {
        return pkgInfo
    }

    return new PackageInfo(logger, pkgRoot)
}
