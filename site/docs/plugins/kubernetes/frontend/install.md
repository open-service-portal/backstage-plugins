# Installing the Kubernetes Resources Frontend Plugin

This guide will help you install and set up the Kubernetes Resources frontend plugin in your Backstage instance.

## Prerequisites

Before installing the plugin, ensure you have:

1. A working Backstage instance
2. The Kubernetes backend deployment installed in your clusters
3. Access to Kubernetes clusters
4. Proper proxy configuration

## Installation Steps

### 1. Add the Package

Install the plugin package using yarn:

```bash
yarn --cwd packages/app add @terasky/backstage-plugin-kubernetes-resources-frontend
```

### 2. Add to Entity Page

Modify your entity page configuration in `packages/app/src/components/catalog/EntityPage.tsx`:

```typescript
import {
  KubernetesResourcesPage,
  KubernetesResourceGraph,
  isKubernetesResourcesAvailable,
} from '@terasky/backstage-plugin-kubernetes-resources-frontend';

const serviceEntityPage = (
  <EntityLayout>
    <EntityLayout.Route 
      path="/kubernetes-resource-page" 
      if={isKubernetesResourcesAvailable}
      title="Kubernetes Resources"
    >
      <KubernetesResourcesPage />
    </EntityLayout.Route>
    <EntityLayout.Route 
      path="/kubernetes-resource-graph" 
      if={isKubernetesResourcesAvailable}
      title="Resource Graph"
    >
      <KubernetesResourceGraph />
    </EntityLayout.Route>
  </EntityLayout>
);
```

### 3. Configure Proxy Settings

Add proxy configuration to your `app-config.yaml`:

```yaml
proxy:
  '/kubernetes-resources/<CLUSTER NAME>':
    target: 'http://<THE INGRESS URL OF THE DEPLOYED APP>'
    changeOrigin: true
    headers:
      Authorization: 'Bearer <SAME TOKEN AS IS USED IN THE K8S PLUGIN CONFIGURATION>'
```

### 4. Deploy Backend Component

Deploy the Kubernetes dependency tracker to your clusters:

```bash
export INGRESS_HOST_NAME="k8s-dependency-tracker.example.com"
wget https://github.com/TeraSky-OSS/kubernetes-dependency-tracker/releases/download/0.1.0/kubernetes-manifest.yaml
sed -i "s/REPLACE_ME/${INGRESS_HOST_NAME}/g" kubernetes-manifest.yaml
kubectl apply -f kubernetes-manifest.yaml
```

### 5. Configure Entity Annotations

Add required annotations to your catalog entities:

```yaml
annotations:
  terasky.backstage.io/kubernetes-resource-name: 'resource-name'
  terasky.backstage.io/kubernetes-resource-kind: 'ResourceKind'
  terasky.backstage.io/kubernetes-resource-api-version: 'group/version'
  terasky.backstage.io/kubernetes-resource-namespace: 'namespace' # Optional
  backstage.io/managed-by-origin-location: 'cluster-name'
```

## New Frontend System Support (Alpha)

The plugin now supports the new frontend system available in the `/alpha` export. To use this:

```typescript
import { createApp } from '@backstage/frontend-defaults';
import { kubernetesResourcesPlugin } from '@terasky/backstage-plugin-kubernetes-resources-frontend/alpha';

export default createApp({
  features: [
    ...
    kubernetesResourcesPlugin,
    ...
  ],
});
```

This replaces the need for manual route configuration in `EntityPage.tsx` and other files. The plugin will be automatically integrated into the appropriate entity pages.

## Verification

After installation, verify that:

1. The plugin appears in your package.json dependencies
2. The Kubernetes resources pages are accessible
3. Resource graphs are rendering correctly
4. Events and YAML views are working
5. Proxy configuration is functioning

## Troubleshooting

Common issues and solutions:

1. **Resources Not Loading**
   - Check proxy configuration
   - Verify backend deployment
   - Ensure cluster access
   - Check entity annotations

2. **Graph Not Rendering**
   - Verify browser console for errors
   - Check resource permissions
   - Ensure backend connectivity
   - Review proxy settings

3. **Permission Issues**
   - Configure permission framework
   - Check token permissions
   - Verify role bindings
   - Review access controls

For configuration options and customization, proceed to the [Configuration Guide](./configure.md). 