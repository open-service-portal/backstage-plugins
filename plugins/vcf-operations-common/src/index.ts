import { createPermission } from '@backstage/plugin-permission-common';

export const viewMetricsPermission = createPermission({
  name: 'vcf-operations.metrics.view',
  attributes: { action: 'read' },
});

export const vcfOperationsPermissions = [
  viewMetricsPermission
];