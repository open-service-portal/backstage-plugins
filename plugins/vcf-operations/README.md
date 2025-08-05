# VCF Operations Plugin

This plugin provides integration with VMware vRealize Operations (VCF Operations) for displaying metrics and analytics data within Backstage.

## Features

- **VCFOperationsExplorer Component**: Interactive metrics explorer with charting capabilities
- **Multiple Metrics Support**: Select and visualize multiple metrics simultaneously
- **Time Range Selection**: Flexible time range picker including custom date/time ranges
- **Real-time Data**: Auto-refresh functionality for live metrics monitoring
- **Instance Support**: Multi-instance VCF Operations support
- **Interactive Charts**: Powered by Recharts for responsive data visualization

## Installation

This plugin is designed to be used with entities that have VCF Automation annotations. The component will automatically detect the resource ID from entity annotations.

## Usage

### Adding the Explorer to an Entity Page

Add the `VCFOperationsExplorer` component as a tab to any entity that has VCF Automation annotations:

```tsx
import { VCFOperationsExplorer } from '@terasky/backstage-plugin-vcf-operations';

// In your entity page
<EntityLayout.Route path="/vcf-operations" title="Operations Metrics">
  <VCFOperationsExplorer />
</EntityLayout.Route>
```

### Required Entity Annotations

The component requires one of the following annotations on the entity:

- `vcf-automation.io/resource-id`: The VCF Automation resource ID
- `vcf-automation.io/deployment-id`: The VCF Automation deployment ID

### Supported Metrics

The plugin includes common metrics such as:

- CPU Usage (%)
- Memory Usage (%)
- Disk Usage (%)
- Network Usage
- Power Usage
- And many more...

You can also add custom metrics using the metric key format (e.g., `cpu|usage_average`).

## Configuration

Configure your VCF Operations instances in your `app-config.yaml`:

```yaml
vcfOperations:
  instances:
  - name: polo-vcf
    baseUrl: 'https://polo-vcf01.terasky.local'
    majorVersion: 9
    relatedVCFAInstances:
    - vcfa-instance-name
    authentication:
      username: 'admin'
      password: 'VMware1!VMware1!'
```