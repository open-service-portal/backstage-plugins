import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
import { FormFieldBlueprint } from '@backstage/plugin-scaffolder-react/alpha';
import { GitOpsManifestUpdaterForm } from './components/GitOpsManifestUpdaterForm/GitOpsManifestUpdaterForm';
import { GitOpsManifestUpdaterSchema } from './components/GitOpsManifestUpdaterForm/GitOpsManifestUpdaterSchema';
import { JsonObject } from '@backstage/types';

interface FieldValidation {
  addError: (message: string) => void;
}

/** @alpha */
export const gitopsManifestUpdaterExtension = FormFieldBlueprint.make({
  name: 'GitOpsManifestUpdater',
  params: {
    field: async () => ({
      $$type: '@backstage/scaffolder/FormField',
      name: 'GitOpsManifestUpdater',
      component: GitOpsManifestUpdaterForm,
      schema: GitOpsManifestUpdaterSchema,
      validation: (formData: JsonObject | undefined, validation: FieldValidation) => {
        if (!formData) {
          validation.addError('Spec is required');
        }
      },
    }),
  },
  disabled: false,
});

/** @alpha */
export const gitopsManifestUpdaterPlugin = createFrontendPlugin({
  pluginId: 'gitops-manifest-updater',
  extensions: [gitopsManifestUpdaterExtension],
});