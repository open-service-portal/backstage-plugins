import {
  createBackendPlugin,
  coreServices,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { vcfOperationsPermissions } from '@terasky/backstage-plugin-vcf-operations-common';

/**
 * The VCF Operations backend plugin provides API endpoints for managing VCF Operations metrics.
 * @public
 */
export const vcfOperationsPlugin = createBackendPlugin({
  pluginId: 'vcf-operations',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
        permissions: coreServices.permissions,
        config: coreServices.rootConfig,
        permissionsRegistry: coreServices.permissionsRegistry,
      },
      async init({
        httpRouter,
        logger,
        permissions,
        config,
        permissionsRegistry,
      }) {
        permissionsRegistry.addPermissions(Object.values(vcfOperationsPermissions));
        
        httpRouter.use(
          await createRouter({
            logger,
            permissions,
            config,
          }),
        );
        httpRouter.addAuthPolicy({
          path: '/health',
          allow: 'unauthenticated',
        });
      },
    });
  },
});