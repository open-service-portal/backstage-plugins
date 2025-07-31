import {
  createPlugin,
  createApiFactory,
  discoveryApiRef,
  identityApiRef,
  createRoutableExtension,
  createExternalRouteRef,
} from '@backstage/core-plugin-api';
import { rootRouteRef } from './routes';
import { vcfAutomationApiRef, VcfAutomationClient } from './api';

export const catalogIndexRouteRef = createExternalRouteRef({
  id: 'catalog-index',
});

export const vcfAutomationPlugin = createPlugin({
  id: 'vcf-automation',
  apis: [
    createApiFactory({
      api: vcfAutomationApiRef,
      deps: { discoveryApi: discoveryApiRef, identityApi: identityApiRef },
      factory: ({ discoveryApi, identityApi }) =>
        new VcfAutomationClient({ discoveryApi, identityApi }),
    }),
  ],
  routes: {
    root: rootRouteRef,
  },
  externalRoutes: {
    catalogIndex: catalogIndexRouteRef,
  },
});

export const VcfAutomationDeploymentDetails = vcfAutomationPlugin.provide(
  createRoutableExtension({
    name: 'VcfAutomationDeploymentDetails',
    component: () =>
      import('./components/VCFAutomationDeploymentDetails').then(m => m.VCFAutomationDeploymentDetails),
    mountPoint: rootRouteRef,
  }),
);

export const VcfAutomationVSphereVMDetails = vcfAutomationPlugin.provide(
  createRoutableExtension({
    name: 'VcfAutomationVSphereVMDetails',
    component: () =>
      import('./components/VCFAutomationVSphereVMDetails').then(m => m.VCFAutomationVSphereVMDetails),
    mountPoint: rootRouteRef,
  }),
);

export const VcfAutomationProjectDetails = vcfAutomationPlugin.provide(
  createRoutableExtension({
    name: 'VcfAutomationProjectDetails',
    component: () =>
      import('./components/VCFAutomationProjectDetails').then(m => m.VCFAutomationProjectDetails),
    mountPoint: rootRouteRef,
  }),
);

export const VcfAutomationDeploymentOverview = vcfAutomationPlugin.provide(
  createRoutableExtension({
    name: 'VcfAutomationDeploymentOverview',
    component: () =>
      import('./components/VCFAutomationDeploymentOverview').then(m => m.VCFAutomationDeploymentOverview),
    mountPoint: rootRouteRef,
  }),
);

export const VcfAutomationVSphereVMOverview = vcfAutomationPlugin.provide(
  createRoutableExtension({
    name: 'VcfAutomationVSphereVMOverview',
    component: () =>
      import('./components/VCFAutomationVSphereVMOverview').then(m => m.VCFAutomationVSphereVMOverview),
    mountPoint: rootRouteRef,
  }),
);

export const VcfAutomationProjectOverview = vcfAutomationPlugin.provide(
  createRoutableExtension({
    name: 'VcfAutomationProjectOverview',
    component: () =>
      import('./components/VCFAutomationProjectOverview').then(m => m.VCFAutomationProjectOverview),
    mountPoint: rootRouteRef,
  }),
);

export const VcfAutomationGenericResourceDetails = vcfAutomationPlugin.provide(
  createRoutableExtension({
    name: 'VcfAutomationGenericResourceDetails',
    component: () =>
      import('./components/VCFAutomationGenericResourceDetails').then(m => m.VCFAutomationGenericResourceDetails),
    mountPoint: rootRouteRef,
  }),
);

export const VcfAutomationGenericResourceOverview = vcfAutomationPlugin.provide(
  createRoutableExtension({
    name: 'VcfAutomationGenericResourceOverview',
    component: () =>
      import('./components/VCFAutomationGenericResourceOverview').then(m => m.VCFAutomationGenericResourceOverview),
    mountPoint: rootRouteRef,
  }),
);

export const VcfAutomationCCINamespaceOverview = vcfAutomationPlugin.provide(
  createRoutableExtension({
    name: 'VcfAutomationCCINamespaceOverview',
    component: () =>
      import('./components/VCFAutomationCCINamespaceOverview').then(m => m.VCFAutomationCCINamespaceOverview),
    mountPoint: rootRouteRef,
  }),
);

export const VcfAutomationCCINamespaceDetails = vcfAutomationPlugin.provide(
  createRoutableExtension({
    name: 'VcfAutomationCCINamespaceDetails',
    component: () =>
      import('./components/VCFAutomationCCINamespaceDetails').then(m => m.VCFAutomationCCINamespaceDetails),
    mountPoint: rootRouteRef,
  }),
);

export const VcfAutomationCCIResourceOverview = vcfAutomationPlugin.provide(
  createRoutableExtension({
    name: 'VcfAutomationCCIResourceOverview',
    component: () =>
      import('./components/VCFAutomationCCIResourceOverview').then(m => m.VCFAutomationCCIResourceOverview),
    mountPoint: rootRouteRef,
  }),
);

export const VcfAutomationCCIResourceDetails = vcfAutomationPlugin.provide(
  createRoutableExtension({
    name: 'VcfAutomationCCIResourceDetails',
    component: () =>
      import('./components/VCFAutomationCCIResourceDetails').then(m => m.VCFAutomationCCIResourceDetails),
    mountPoint: rootRouteRef,
  }),
);
