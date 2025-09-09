import {
  createFrontendPlugin,
} from '@backstage/frontend-plugin-api';
import { EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';
import { isAIRulesAvailable } from './components/AiRulesComponent';

/** @alpha */
export const aiRulesPlugin = createFrontendPlugin({
  pluginId: 'ai-rules',
  extensions: [
    EntityContentBlueprint.make({
      params: {
        path: '/ai-rules',
        filter: isAIRulesAvailable,
        title: 'AI Rules',
        loader: () => import('./components/AiRulesComponent/AiRulesComponent').then(m => <m.AIRulesComponent />),
      },
    }),
  ],
});