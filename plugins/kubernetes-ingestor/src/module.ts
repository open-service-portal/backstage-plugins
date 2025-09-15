import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import {
  catalogServiceRef,
  catalogProcessingExtensionPoint,
} from '@backstage/plugin-catalog-node/alpha';
import { KubernetesEntityProvider, XRDTemplateEntityProvider } from './providers/EntityProvider';

export const catalogModuleKubernetesIngestor = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'kubernetes-ingestor',
  register(reg) {
    reg.registerInit({
      deps: {
        catalog: catalogProcessingExtensionPoint,
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        discovery: coreServices.discovery,
        catalogApi: catalogServiceRef,
        permissions: coreServices.permissions,
        auth: coreServices.auth,
        httpAuth: coreServices.httpAuth,
        scheduler: coreServices.scheduler,
      },
      async init({
        catalog,
        logger,
        config,
        catalogApi,
        permissions,
        discovery,
        httpAuth,
        auth,
        scheduler,
      }) {
        // Check if this plugin should run based on selector
        const ingestorSelector = config.getOptionalString('ingestorSelector') ?? 'kubernetes-ingestor';
        
        // Support multiple selectors for compatibility
        const validSelectors = [
          'kubernetes-ingestor',                    // Default/legacy selector
          'open-service-portal-ingestor',          // Our custom selector
          '@open-service-portal/backstage-plugin-kubernetes-ingestor',  // Full package name
        ];
        
        const shouldActivate = !ingestorSelector || validSelectors.includes(ingestorSelector);
        
        if (!shouldActivate) {
          logger.info(`OpenPortal Kubernetes Ingestor skipped - using ${ingestorSelector}`);
          return;
        }
        logger.info('OpenPortal Kubernetes Ingestor (TeraSky-compatible fork) v1.0.0 starting');

        const taskRunner = scheduler.createScheduledTaskRunner({
          frequency: {
            seconds: config.getOptionalNumber(
              'kubernetesIngestor.components.taskRunner.frequency',
            ) ?? 600,
          },
          timeout: {
            seconds: config.getOptionalNumber(
              'kubernetesIngestor.components.taskRunner.timeout',
            ) ?? 600,
          },
        });

        const xrdTaskRunner = scheduler.createScheduledTaskRunner({
          frequency: {
            seconds: config.getOptionalNumber(
              'kubernetesIngestor.crossplane.xrds.taskRunner.frequency',
            ) ?? 600,
          },
          timeout: {
            seconds: config.getOptionalNumber(
              'kubernetesIngestor.crossplane.xrds.taskRunner.timeout',
            ) ?? 600,
          },
        });

        const templateEntityProvider = new KubernetesEntityProvider(
          taskRunner,
          logger,
          config,
          catalogApi,
          permissions,
          discovery,
          auth,
          httpAuth,
        );

        const xrdTemplateEntityProvider = new XRDTemplateEntityProvider(
          xrdTaskRunner,
          logger,
          config,
          catalogApi,
          discovery,
          permissions,
          auth,
          httpAuth,
        );

        const xrdEnabled = config.getOptionalBoolean('kubernetesIngestor.crossplane.xrds.enabled');
        await catalog.addEntityProvider(templateEntityProvider);
        // Only disable if explicitly set to false; default is enabled
        if (xrdEnabled !== false) {
          await catalog.addEntityProvider(xrdTemplateEntityProvider);
        }
      },
    });
  },
});
