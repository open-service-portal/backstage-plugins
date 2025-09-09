# Configuring the Educates Frontend Plugin

This guide covers the configuration options available for the Educates frontend plugin.

## New Frontend System Configuration (Alpha)

When using the new frontend system through the `/alpha` export, the plugin is configured automatically with sensible defaults. The plugin will be automatically integrated into the navigation without requiring manual route configuration.

## Configuration File

The frontend plugin relies on the backend configuration. 

## Available Permissions

Configure these permissions to control access to plugin features:

1. `educates.workshops.view`
    - Required to view the workshops catalog
    - Controls access to workshop details

2. `educates.workshop-sessions.create`
    - Required to launch workshop sessions
    - Controls ability to create new sessions

## UI Customization

### Theme Integration

The plugin follows your Backstage theme settings. Customize the appearance by modifying your theme configuration in `packages/app/src/themes/index.ts`:

```typescript
import { createTheme } from '@material-ui/core';

export const customTheme = createTheme({
  components: {
    // Customize workshop card appearance
    MuiCard: {
      styleOverrides: {
        root: {
          // Your custom styles
        },
      },
    },
  },
});
```

## Portal Configuration

Portal configuration is managed through the backend plugin. Refer to the [backend configuration guide](../backend/configure.md) for details on:

- Adding training portals
- Configuring authentication
- Managing portal connections
- Setting up session handling

## Environment Variables

The frontend plugin doesn't require specific environment variables, but ensure the backend plugin's environment variables are properly configured as they affect frontend functionality.
