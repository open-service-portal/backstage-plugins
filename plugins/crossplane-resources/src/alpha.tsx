import {
  createFrontendPlugin,
} from '@backstage/frontend-plugin-api';
import { EntityCardBlueprint, EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';
import { isCrossplaneAvailable } from './components/isCrossplaneAvailable';
/** @alpha */
export const crossplaneResourcesPlugin = createFrontendPlugin({
  pluginId: 'crossplane-resources',
  extensions: [
    // Main tabs
    EntityCardBlueprint.make({
      name: 'crossplane.overview',
      params: {
        filter: isCrossplaneAvailable,
        loader: () => import('./components/CrossplaneOverviewCardSelector').then(m => <m.default />),
      },
      disabled: false,
    }),
    EntityContentBlueprint.make({
      name: 'crossplane.table',
      params: {
        filter: isCrossplaneAvailable,
        path: '/crossplane-resources-table',
        title: 'Resources Table',
        loader: () => import('./components/CrossplaneResourcesTableSelector').then(m => <m.default />),
      },
      disabled: false,
    }),
    EntityContentBlueprint.make({
      name: 'crossplane.graph',
      params: {
        filter: isCrossplaneAvailable,
        path: '/crossplane-resources-graph',
        title: 'Resources Graph',
        loader: () => import('./components/CrossplaneResourceGraphSelector').then(m => <m.default />),
      },
      disabled: false,
    }),
  ],
});