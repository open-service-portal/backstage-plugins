# Installing the Educates Frontend Plugin

This guide will help you install and set up the Educates frontend plugin in your Backstage instance.

## Prerequisites

Before installing the plugin, ensure you have:

1. A working Backstage instance
2. The Educates backend plugin installed and configured
3. Access to one or more Educates training portals

## Installation Steps

### 1. Add the Package

Install the plugin package using yarn:

```bash
yarn --cwd packages/app add @terasky/backstage-plugin-educates
```

### 2. Add to App Routes

Add the Educates page to your app routes in `packages/app/src/App.tsx`:

```typescript
import { EducatesPage } from '@terasky/backstage-plugin-educates';

const routes = (
  <FlatRoutes>
    {/* ... other routes ... */}
    <Route path="/educates" element={<EducatesPage />} />
  </FlatRoutes>
);
```

### 3. Add to Sidebar

Add the Educates link to your sidebar in `packages/app/src/components/Root/Root.tsx`:

```typescript
import { SchoolIcon } from '@material-ui/icons';

export const Root = () => (
  <SidebarPage>
    <Sidebar>
      {/* ... other sidebar items ... */}
      <SidebarItem icon={SchoolIcon} to="/educates" text="Workshops" />
    </Sidebar>
  </SidebarPage>
);
```

## New Frontend System Support (Alpha)

The plugin now supports the new frontend system available in the `/alpha` export. To use this:

```typescript
import { createApp } from '@backstage/frontend-defaults';
import { educatesPlugin } from '@terasky/backstage-plugin-educates/alpha';

export default createApp({
  features: [
    ...
    educatesPlugin,
    ...
  ],
});
```

This replaces the need for manual route configuration in `App.tsx` and `Root.tsx` files. The plugin will be automatically integrated into the navigation.

## Verification

After installation, verify that:

1. The plugin appears in your package.json dependencies
2. The Workshops link appears in your sidebar
3. The workshops page loads successfully
4. You can view available workshops from your training portals

## Troubleshooting

Common issues and solutions:

1. **Page Not Found**
    - Verify route configuration in App.tsx
    - Check sidebar link path
    - Ensure all imports are correct

2. **No Workshops Displayed**
    - Confirm backend plugin is installed and configured
    - Check training portal configuration
    - Verify permissions are properly set up

For configuration options and customization, proceed to the [Configuration Guide](./configure.md).
