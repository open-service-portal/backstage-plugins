import {
  createApiFactory,
  createPlugin,
  createRoutableExtension,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';
import { vcfOperationsApiRef, VcfOperationsClient } from './api/VcfOperationsClient';

export const vcfOperationsPlugin = createPlugin({
  id: 'vcf-operations',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: vcfOperationsApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new VcfOperationsClient({
          discoveryApi,
          fetchApi,
        }),
    }),
  ],
});

export const VCFOperationsExplorerPage = vcfOperationsPlugin.provide(
  createRoutableExtension({
    name: 'VCFOperationsExplorerPage',
    component: () =>
      import('./components/VCFOperationsExplorer').then(m => m.VCFOperationsExplorer),
    mountPoint: rootRouteRef,
  }),
);

// Alternative: Component extension for direct use
export const VCFOperationsExplorerComponent = vcfOperationsPlugin.provide(
  createRoutableExtension({
    name: 'VCFOperationsExplorerComponent',
    component: () =>
      import('./components/VCFOperationsExplorer').then(m => m.VCFOperationsExplorer),
    mountPoint: rootRouteRef,
  }),
);