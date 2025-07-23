import { createPermission, ResourcePermission } from '@backstage/plugin-permission-common';

/**
 * Resource type for training portal permissions
 * @public
 */
export const EDUCATES_TRAINING_PORTAL_RESOURCE_TYPE = 'educates-training-portal';

/**
 * Resource type for workshop permissions
 * @public
 */
export const EDUCATES_WORKSHOP_RESOURCE_TYPE = 'educates-workshop';

/**
 * Permission to view specific training portals
 * @public
 */
export const portalViewPermission = createPermission({
  name: 'educates.portal.view',
  attributes: { action: 'read' },
  resourceType: EDUCATES_TRAINING_PORTAL_RESOURCE_TYPE,
}) as ResourcePermission<'educates-training-portal'>;

/**
 * Permission to start specific workshops
 * @public
 */
export const workshopStartPermission = createPermission({
  name: 'educates.workshop.start', 
  attributes: { action: 'create' },
  resourceType: EDUCATES_WORKSHOP_RESOURCE_TYPE,
}) as ResourcePermission<'educates-workshop'>;

/**
 * All permissions available in the Educates plugin
 * @public
 */
export const educatesPermissions = [
  portalViewPermission,
  workshopStartPermission,
];

/**
 * @deprecated use portalViewPermission instead
 */
export const EDUCATES_VIEW_PORTAL = portalViewPermission;

/**
 * @deprecated use workshopStartPermission instead  
 */
export const EDUCATES_START_WORKSHOP = workshopStartPermission;