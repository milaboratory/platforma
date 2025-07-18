import { PlViteStdNode } from '@milaboratories/build-configs/vite';

export default PlViteStdNode({
    define: {
        PACKAGE_VERSION: JSON.stringify(process.env.npm_package_version),
    }
});
