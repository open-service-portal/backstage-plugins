# Installing the ScaleOps Frontend Plugin

This guide will help you install and set up the ScaleOps frontend plugin in your Backstage instance.

## Prerequisites

Before installing the plugin, ensure you have:

1. A working Backstage instance
2. Access to a ScaleOps instance
3. Authentication credentials (if required)
4. Proper proxy configuration

## Installation Steps

### 1. Add the Package

Install the plugin package using yarn:

```bash
yarn --cwd packages/app add @terasky/backstage-plugin-scaleops-frontend
```

### 2. Add to Entity Page

Modify your entity page configuration in `packages/app/src/components/catalog/EntityPage.tsx`:

```typescript
import { ScaleOpsDashboard, isScaleopsAvailable } from '@terasky/backstage-plugin-scaleops-frontend';

const serviceEntityPage = (
  <EntityLayout>
    <EntityLayout.Route 
      path="/scaleops" 
      if={isScaleopsAvailable}
      title="ScaleOps"
    >
      <ScaleOpsDashboard />
    </EntityLayout.Route>
  </EntityLayout>
);
```

### 3. Configure Authentication

Add authentication configuration to your `app-config.yaml`:

#### With Internal Authentication
```yaml
scaleops:
  baseUrl: 'https://your-scaleops-instance.com'
  linkToDashboard: true
  authentication:
    enabled: true
    user: 'YOUR_USERNAME'
    password: 'YOUR_PASSWORD'

proxy:
  endpoints:
    '/scaleops':
      target: 'https://your-scaleops-instance.com'
      changeOrigin: true
```

#### Without Authentication
```yaml
scaleops:
  baseUrl: 'https://your-scaleops-instance.com'
  linkToDashboard: true
  authentication:
    enabled: false

proxy:
  endpoints:
    '/scaleops':
      target: 'https://your-scaleops-instance.com'
      changeOrigin: true
```

### 4. Configure Environment Variables

Set up any required environment variables:

```bash
export SCALEOPS_USERNAME=your-username
export SCALEOPS_PASSWORD=your-password
```

## New Frontend System Support (Alpha)

The plugin now supports the new frontend system available in the `/alpha` export. To use this:

```typescript
import { createApp } from '@backstage/frontend-defaults';
import { scaleopsPlugin } from '@terasky/backstage-plugin-scaleops-frontend/alpha';

export default createApp({
  features: [
    ...
    scaleopsPlugin,
    ...
  ],
});
```

This replaces the need for manual route configuration in `EntityPage.tsx` and other files. The plugin will be automatically integrated into the appropriate entity pages.

## Verification

After installation, verify that:

1. The plugin appears in your package.json dependencies
2. The ScaleOps dashboard is accessible
3. Cost data is being displayed
4. Authentication is working
5. Links to ScaleOps are functioning

## Troubleshooting

Common issues and solutions:

1. **Dashboard Not Loading**
    - Check proxy configuration
    - Verify authentication settings
    - Check ScaleOps instance URL
    - Review browser console

2. **Authentication Issues**
    - Verify credentials
    - Check environment variables
    - Review proxy headers
    - Test ScaleOps access

3. **Data Not Displaying**
    - Check API connectivity
    - Verify data availability
    - Review permissions
    - Check entity configuration

For configuration options and customization, proceed to the [Configuration Guide](./configure.md).
