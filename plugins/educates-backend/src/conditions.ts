import { createConditionExports } from '@backstage/plugin-permission-node';
import { 
  educatesPortalPermissionResourceRef,
  educatesWorkshopPermissionResourceRef,
  rules 
} from './rules';

const { conditions: portalConditions, createConditionalDecision: createPortalConditionalDecision } = 
  createConditionExports({
    resourceRef: educatesPortalPermissionResourceRef,
    rules: rules.portal,
  });

const { conditions: workshopConditions, createConditionalDecision: createWorkshopConditionalDecision } = 
  createConditionExports({
    resourceRef: educatesWorkshopPermissionResourceRef,
    rules: rules.workshop,
  });

/**
 * Conditions for portal permissions
 * @public
 */
export const educatesPortalConditions = portalConditions;

/**
 * Conditions for workshop permissions  
 * @public
 */
export const educatesWorkshopConditions = workshopConditions;

/**
 * Factory for creating conditional decisions for portal permissions
 * @public
 */
export const createEducatesPortalConditionalDecision = createPortalConditionalDecision;

/**
 * Factory for creating conditional decisions for workshop permissions
 * @public
 */
export const createEducatesWorkshopConditionalDecision = createWorkshopConditionalDecision; 