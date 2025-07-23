# Configuring the Educates Backend Plugin

This guide covers the configuration options available for the Educates backend plugin.

## Configuration File

The plugin is configured through your `app-config.yaml`. Here's a comprehensive example:

```yaml
educates:
  # Required: Training portal configurations
  trainingPortals:
    - name: example-portal
      url: https://example-training-portal.com
      robotUsername: robot@educates
      robotPassword: ${EDUCATES_EXAMPLE_ROBOT_PASSWORD}
      clientId: ${EDUCATES_EXAMPLE_ROBOT_CLIENT_ID}
      clientSecret: ${EDUCATES_EXAMPLE_ROBOT_CLIENT_SECRET}
```

## Environment Variables

Required environment variables for each training portal:

```bash
EDUCATES_<PORTAL_NAME>_ROBOT_PASSWORD=your-robot-password
EDUCATES_<PORTAL_NAME>_ROBOT_CLIENT_ID=your-client-id
EDUCATES_<PORTAL_NAME>_ROBOT_CLIENT_SECRET=your-client-secret
```

## Portal Configuration

### Basic Portal Setup

Minimum required configuration for each portal:

```yaml
educates:
  trainingPortals:
    - name: portal-name
      url: https://portal-url.com
      robotUsername: robot@educates
      robotPassword: ${EDUCATES_PORTAL_NAME_ROBOT_PASSWORD}
      clientId: ${EDUCATES_PORTAL_NAME_ROBOT_CLIENT_ID}
      clientSecret: ${EDUCATES_PORTAL_NAME_ROBOT_CLIENT_SECRET}
```

## Permission Configuration

The Educates plugin uses Backstage's resource-based permission system. Configure permissions in your permission policy.

### Permission Policy Setup

Add the following to your permission policy file:

```typescript
import { 
  portalViewPermission,
  workshopStartPermission,
} from '@terasky/backstage-plugin-educates-common';
import {
  educatesPortalConditions,
  educatesWorkshopConditions,
  createEducatesPortalConditionalDecision,
  createEducatesWorkshopConditionalDecision,
} from '@terasky/backstage-plugin-educates-backend/alpha';

// In your permission policy class
async handle(request: PolicyQuery): Promise<PolicyDecision> {
  if (isPermission(request.permission, portalViewPermission)) {
    // Allow users to view portals they have access to
    return createEducatesPortalConditionalDecision(
      request.permission,
      educatesPortalConditions.hasPortalAccess({
        userRefs: [request.identity.userEntityRef],
        portalName: 'your-portal-name'
      })
    );
  }

  if (isPermission(request.permission, workshopStartPermission)) {
    // Allow users to start workshops they have access to
    return createEducatesWorkshopConditionalDecision(
      request.permission,
      educatesWorkshopConditions.hasWorkshopAccess({
        userRefs: [request.identity.userEntityRef],
        portalName: 'your-portal-name',
        workshopName: 'specific-workshop'
      })
    );
  }

  return { result: AuthorizeResult.ALLOW };
}
```

### Simple Permission Policy

For a basic setup allowing all authenticated users:

```typescript
import { 
  portalViewPermission,
  workshopStartPermission,
} from '@terasky/backstage-plugin-educates-common';

// In your permission policy
async handle(request: PolicyQuery): Promise<PolicyDecision> {
  if (isPermission(request.permission, portalViewPermission)) {
    return { result: AuthorizeResult.ALLOW };
  }

  if (isPermission(request.permission, workshopStartPermission)) {
    return { result: AuthorizeResult.ALLOW };
  }

  return { result: AuthorizeResult.ALLOW };
}
```

### Advanced Permission Rules

You can customize access using the built-in permission rules:

```typescript
import { rules } from '@terasky/backstage-plugin-educates-backend/alpha';

// Example: Portal ownership rule
const portalOwnershipDecision = createEducatesPortalConditionalDecision(
  request.permission,
  rules.portal.isPortalOwner({
    userRefs: [request.identity.userEntityRef]
  })
);

// Example: Workshop access rule
const workshopAccessDecision = createEducatesWorkshopConditionalDecision(
  request.permission,
  rules.workshop.hasWorkshopAccess({
    userRefs: [request.identity.userEntityRef],
    portalName: 'production-portal',
    workshopName: 'advanced-k8s'
  })
);
```

### Migration from Legacy Permissions

If you're migrating from the legacy permissions, update your permission policy:

```typescript
// OLD - Deprecated
// educates.workshops.view
// educates.workshop-sessions.create

// NEW - Resource-based
import { 
  portalViewPermission,      // replaces educates.workshops.view
  workshopStartPermission,   // replaces educates.workshop-sessions.create
} from '@terasky/backstage-plugin-educates-common';
```

For installation instructions, refer to the [Installation Guide](./install.md).
