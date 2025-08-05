import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Typography,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  Button,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { makeStyles } from '@material-ui/core/styles';
import { useApi } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { vcfOperationsApiRef, MetricData, Resource } from '../api/VcfOperationsClient';
import { MetricChart } from './MetricChart';
import { NotImplementedMessage } from './NotImplementedMessage';

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(2),
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  topControls: {
    marginBottom: theme.spacing(2),
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.paper,
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
  },
  topControlsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(3),
    flexWrap: 'wrap',
  },
  controlGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  mainContent: {
    display: 'flex',
    flex: 1,
    gap: theme.spacing(2),
    minHeight: 0, // Important for flex children
  },
  leftPanel: {
    width: 320,
    minWidth: 320,
    display: 'flex',
    flexDirection: 'column',
  },
  metricsCard: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  metricsCardContent: {
    flex: 1,
    overflow: 'auto',
    paddingTop: theme.spacing(1),
    paddingBottom: theme.spacing(1),
  },
  rightPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  chartsContainer: {
    flex: 1,
    overflow: 'auto',
  },
  chartCard: {
    marginBottom: theme.spacing(2),
    height: 400,
  },
  formControl: {
    minWidth: 180,
  },
  metricCheckbox: {
    padding: theme.spacing(0.5),
  },
  metricItem: {
    paddingLeft: theme.spacing(4), // Indent metrics under category headers
    paddingRight: theme.spacing(1),
    borderRadius: theme.shape.borderRadius,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: theme.spacing(1),
    color: theme.palette.text.primary,
  },
  categoryHeader: {
    fontWeight: 600,
    fontSize: '0.875rem',
    color: theme.palette.primary.main,
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
    paddingLeft: theme.spacing(1),
    borderBottom: `1px solid ${theme.palette.divider}`,
    paddingBottom: theme.spacing(0.5),
    '&:first-child': {
      marginTop: theme.spacing(0.5),
    },
  },
  categoryHeaderContainer: {
    display: 'flex',
    alignItems: 'center',
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
    paddingLeft: 0, // Align to the left edge
    paddingRight: theme.spacing(1),
    borderBottom: `1px solid ${theme.palette.divider}`,
    paddingBottom: theme.spacing(0.5),
    '&:first-child': {
      marginTop: theme.spacing(0.5),
    },
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
      cursor: 'pointer',
    },
  },
  categoryTitle: {
    fontWeight: 600,
    fontSize: '0.875rem',
    color: theme.palette.primary.main,
    flex: 1,
    marginLeft: theme.spacing(0.5),
  },
  selectAllContainer: {
    padding: theme.spacing(1),
    borderBottom: `1px solid ${theme.palette.divider}`,
    // Removed background color - same as rest of panel
  },
  refreshButton: {
    minWidth: 'auto',
    padding: theme.spacing(0.5, 1),
  },
  resourceInfo: {
    marginBottom: theme.spacing(2),
    padding: theme.spacing(1),
    backgroundColor: theme.palette.grey[50],
    borderRadius: theme.shape.borderRadius,
  },
}));

interface MetricSelection {
  key: string;
  label: string;
}

interface MetricCategory {
  name: string;
  metrics: MetricSelection[];
}

const METRIC_CATEGORIES: MetricCategory[] = [
  {
    name: 'CPU Metrics',
    metrics: [
      { key: 'cpu|usage_average', label: 'Usage (%)' },
      { key: 'cpu|usagemhz_average', label: 'Usage (MHz)' },
      { key: 'cpu|readyPct', label: 'Ready (%)' },
      { key: 'cpu|costopPct', label: 'Co-Stop (%)' },
      { key: 'cpu|capacity_contentionPct', label: 'Contention (%)' },
    ],
  },
  {
    name: 'Memory Metrics',
    metrics: [
      { key: 'mem|consumed_average', label: 'Consumed (KB)' },
      { key: 'mem|balloonPct', label: 'Balloon (%)' },
      { key: 'mem|host_contentionPct', label: 'Contention (%)' },
      { key: 'mem|guest_usage', label: 'Guest Usage (%)' },
      { key: 'mem|guest_demand', label: 'Guest Demand (%)' },
      { key: 'mem|swapped_average', label: 'Swapped (KB)' },
      { key: 'mem|usage_average', label: 'Usage (%)' },
      { key: 'mem|vmMemoryDemand', label: 'Utilization (KB)' },
    ],
  },
  {
    name: 'Storage Metrics',
    metrics: [
      { key: 'diskspace|snapshot', label: 'Snapshot Space (GB)' },
      { key: 'diskspace|usageWithoutOverhead', label: 'Usage (GB)' },
      { key: 'storage|totalReadLatency_average', label: 'Read Latency (ms)' },
      { key: 'storage|totalWriteLatency_average', label: 'Write Latency (ms)' },
      { key: 'virtualDisk|read_average', label: 'Read Throughput (KBps)' },
    ],
  },
  {
    name: 'Network Metrics',
    metrics: [
      { key: 'net|droppedTx_summation', label: 'Dropped Tx (Packets)' },
      { key: 'net|received_average', label: 'Data Receive Rate (KBps)' },
      { key: 'net|transmitted_average', label: 'Data Transmit Rate (KBps)' },
      { key: 'net|usage_average', label: 'Usage Rate (KBps)' },
    ],
  },
  {
    name: 'System Health',
    metrics: [
      { key: 'System Attributes|health', label: 'Health Score' },
      { key: 'badge|health', label: 'Health Badge' },
      { key: 'badge|efficiency', label: 'Efficiency Badge' },
      { key: 'badge|risk', label: 'Risk Badge' },
      { key: 'badge|compliance', label: 'Compliance Badge' },
      { key: 'System Attributes|availability', label: 'Availability' },
    ],
  },
  {
    name: 'Alerts & Monitoring',
    metrics: [
      { key: 'System Attributes|total_alert_count', label: 'Total Alerts' },
      { key: 'System Attributes|alert_count_critical', label: 'Critical Alerts' },
      { key: 'System Attributes|alert_count_warning', label: 'Warning Alerts' },
      { key: 'System Attributes|alert_count_info', label: 'Info Alerts' },
    ],
  },
  {
    name: 'Power & Environment',
    metrics: [
      { key: 'power|energy_summation_sum', label: 'Energy Consumed (Wh)' },
    ],
  },
];

// Flatten all metrics for easy access
const ALL_METRICS: MetricSelection[] = METRIC_CATEGORIES.flatMap(category => category.metrics);

const TIME_RANGES = [
  { label: 'Last Hour', hours: 1 },
  { label: 'Last 6 Hours', hours: 6 },
  { label: 'Last 24 Hours', hours: 24 },
  { label: 'Last 7 Days', hours: 168 },
  { label: 'Last 30 Days', hours: 720 },
  { label: 'Custom', hours: -1 },
];

interface ResourceDetectionResult {
  found: boolean;
  resource?: Resource;
  error?: string;
  notImplemented?: {
    entityType: string;
    entityKind?: string;
    reason: string;
  };
}

export const VCFOperationsExplorer = () => {
  const classes = useStyles();
  const vcfOperationsApi = useApi(vcfOperationsApiRef);
  const { entity } = useEntity();

  // Default selected metrics: CPU, Memory, and Network usage
  const defaultMetrics = [
    { key: 'cpu|usage_average', label: 'CPU Usage (%)' },
    { key: 'mem|usage_average', label: 'Memory Usage (%)' },
    { key: 'net|usage_average', label: 'Network Usage (KBps)' },
  ];
  const [selectedMetrics, setSelectedMetrics] = useState<MetricSelection[]>(defaultMetrics);
  const [timeRange, setTimeRange] = useState(24); // Default to 24 hours
  const [customStartTime, setCustomStartTime] = useState('');
  const [customEndTime, setCustomEndTime] = useState('');
  const [rollUpType, setRollUpType] = useState('AVERAGE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metricsData, setMetricsData] = useState<MetricData[]>([]);
  const [instances, setInstances] = useState<Array<{ name: string }>>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [resourceDetection, setResourceDetection] = useState<ResourceDetectionResult>({ found: false });
  const [detectingResource, setDetectingResource] = useState(true);

  // Load instances
  useEffect(() => {
    const loadInstances = async () => {
      try {
        const instancesList = await vcfOperationsApi.getInstances();
        setInstances(instancesList);
        if (instancesList.length === 1) {
          setSelectedInstance(instancesList[0].name);
        }
      } catch (err) {
        // Failed to load instances - handled silently
      }
    };

    loadInstances();
  }, [vcfOperationsApi]);

  // Extract URN from CCI namespace endpoint URL
  const extractUrnFromEndpoint = (endpoint: string): string | null => {
    const match = endpoint.match(/urn:vcloud:namespace:[a-f0-9-]+/);
    return match ? match[0] : null;
  };

  // Detect appropriate VCF Operations resource
  useEffect(() => {
    const detectResource = async () => {
      setDetectingResource(true);
      setError(null);

      try {
        const entityKind = entity.kind;
        const entityType = entity.spec?.type as string;
        const entityTitle = entity.metadata.title || entity.metadata.name;
        const tags = entity.metadata.tags || [];

        // Check for supervisor namespace components
        const cciNamespaceEndpoint = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-cci-namespace-endpoint'];
        if (cciNamespaceEndpoint) {
          const urn = extractUrnFromEndpoint(cciNamespaceEndpoint);
          if (urn) {
            try {
              const resource = await vcfOperationsApi.findResourceByProperty(
                'summary|vcfa_ns_uuid',
                urn,
                selectedInstance || undefined,
              );
              
              if (resource) {
                setResourceDetection({ found: true, resource });
                return;
              }
              setResourceDetection({
                found: false,
                error: `No VCF Operations resource found for namespace URN: ${urn}. Make sure the namespace exists in VCF Operations and the URN matches exactly.`,
              });
              return;
            } catch (err) {
              setResourceDetection({
                found: false,
                error: `Error searching for namespace in VCF Operations: ${err instanceof Error ? err.message : String(err)}`,
              });
              return;
            }
          }
        }

        // Check for supervisor resources with kind:virtualmachine tag
        if (tags.includes('kind:virtualmachine')) {
          let resourceName = entityTitle;
          
          if (tags.includes('standalone-resource')) {
            // Handle standalone VMs - remove " (Standalone)" suffix
            resourceName = entityTitle.replace(' (Standalone)', '');
          } else {
            // Handle non-standalone VMs - extract name from "Open Remote Console" link
            const links = entity.metadata.links || [];
            const remoteConsoleLink = links.find(link => link.title === 'Open Remote Console');
            
            if (remoteConsoleLink && remoteConsoleLink.url) {
              // Extract last segment from URL (after final /)
              const urlSegments = remoteConsoleLink.url.split('/');
              const lastSegment = urlSegments[urlSegments.length - 1];
              
              if (lastSegment) {
                resourceName = lastSegment;
              } else {
                setResourceDetection({
                  found: false,
                  error: `Could not extract VM name from "Open Remote Console" link: ${remoteConsoleLink.url}`,
                });
                return;
              }
            } else {
              setResourceDetection({
                found: false,
                error: `No "Open Remote Console" link found in entity metadata. Non-standalone VMs require this link to extract the VM name.`,
              });
              return;
            }
          }
          
          try {
            const resource = await vcfOperationsApi.findResourceByName(
              resourceName,
              selectedInstance || undefined,
            );
            
            if (resource) {
              setResourceDetection({ found: true, resource });
              return;
            }
            setResourceDetection({
              found: false,
              error: `No VCF Operations resource found with name: ${resourceName}. Make sure the VM exists in VCF Operations and the name matches exactly.`,
            });
            return;
          } catch (err) {
            setResourceDetection({
              found: false,
              error: `Error searching for VM in VCF Operations: ${err instanceof Error ? err.message : String(err)}`,
            });
            return;
          }
        }

        // Check for cluster kind - not implemented
        if (tags.includes('kind:cluster')) {
          setResourceDetection({
            found: false,
            notImplemented: {
              entityType: 'Cluster',
              reason: 'Cluster metrics support is currently being developed and will be available in an upcoming release.',
            },
          });
          return;
        }

        // Check for VCF Automation project domains
        if (entityKind.toLowerCase() === 'domain' && entityType === 'vcf-automation-project') {
          try {
            const resource = await vcfOperationsApi.findResourceByName(
              entityTitle,
              selectedInstance || undefined,
            );
            
            if (resource) {
              setResourceDetection({ found: true, resource });
              return;
            }
            setResourceDetection({
              found: false,
              error: `No VCF Operations resource found for project: ${entityTitle}. Make sure the project exists in VCF Operations and the name matches exactly.`,
            });
            return;
          } catch (err) {
            setResourceDetection({
              found: false,
              error: `Error searching for project in VCF Operations: ${err instanceof Error ? err.message : String(err)}`,
            });
            return;
          }
        }

        // Check for deployment systems - not implemented
        if (entityKind.toLowerCase() === 'system' && entityType === 'deployment') {
          setResourceDetection({
            found: false,
            notImplemented: {
              entityType: 'Deployment',
              reason: 'Deployment metrics support is currently being developed and will be available in an upcoming release.',
            },
          });
          return;
        }

        // Check for other kinds
        const otherKinds = tags.filter(tag => tag.startsWith('kind:') && !['kind:virtualmachine', 'kind:cluster'].includes(tag));
        if (otherKinds.length > 0) {
          setResourceDetection({
            found: false,
            notImplemented: {
              entityType: otherKinds[0].replace('kind:', ''),
              reason: `Support for ${otherKinds[0].replace('kind:', '')} resources is currently being developed and will be available in an upcoming release.`,
            },
          });
          return;
        }

        // Default: No specific mapping found
        setResourceDetection({
          found: false,
          error: `No direct VCF Operations resource mapping found for this entity type (${entityKind}:${entityType}).`,
        });

      } catch (err) {
        setResourceDetection({
          found: false,
          error: `Unexpected error during resource detection: ${err instanceof Error ? err.message : String(err)}`,
        });
      } finally {
        setDetectingResource(false);
      }
    };

    if (selectedInstance || instances.length === 1) {
      detectResource();
    }
  }, [entity, selectedInstance, instances, vcfOperationsApi]);

  const getTimeRangeParams = useCallback(() => {
    const now = Date.now();
    let begin: number;
    let end: number = now;

    if (timeRange === -1 && customStartTime && customEndTime) {
      begin = new Date(customStartTime).getTime();
      end = new Date(customEndTime).getTime();
    } else {
      begin = now - (timeRange * 60 * 60 * 1000);
    }

    // Ensure valid time range (begin < end)
    if (begin >= end) {
      begin = end - (60 * 60 * 1000); // 1 hour before end
    }
    
    // Debug logging for troubleshooting
    if (process.env.NODE_ENV === 'development') {
      console.log('Time range params:', {
        now: new Date(now).toISOString(),
        begin: new Date(begin).toISOString(),
        end: new Date(end).toISOString(),
        timeRange,
        customStartTime,
        customEndTime,
      });
    }

    return { begin, end };
  }, [timeRange, customStartTime, customEndTime]);

  const fetchMetrics = useCallback(async () => {
    if (!resourceDetection.found || !resourceDetection.resource || selectedMetrics.length === 0) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { begin, end } = getTimeRangeParams();
      const statKeys = selectedMetrics.map(metric => metric.key);

      const data = await vcfOperationsApi.getResourceMetrics(
        resourceDetection.resource.identifier,
        statKeys,
        begin,
        end,
        rollUpType,
        selectedInstance || undefined,
      );

      setMetricsData(data.values || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMetricsData([]);
    } finally {
      setLoading(false);
    }
  }, [resourceDetection, selectedMetrics, getTimeRangeParams, rollUpType, selectedInstance, vcfOperationsApi]);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh || !resourceDetection.found) return undefined;

    const interval = setInterval(fetchMetrics, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [autoRefresh, fetchMetrics, resourceDetection.found]);

  // Automatic loading effect - load metrics whenever selections change
  useEffect(() => {
    if (resourceDetection.found && selectedMetrics.length > 0 && selectedInstance) {
      fetchMetrics();
    }
  }, [selectedMetrics, timeRange, rollUpType, selectedInstance, resourceDetection.found]);

  const handleMetricToggle = (metric: MetricSelection) => {
    setSelectedMetrics(prev => {
      const isSelected = prev.some(m => m.key === metric.key);
      if (isSelected) {
        return prev.filter(m => m.key !== metric.key);
      }
      return [...prev, metric];
    });
  };

  const handleSelectAll = () => {
    setSelectedMetrics([...ALL_METRICS]);
  };

  const handleDeselectAll = () => {
    setSelectedMetrics([]);
  };

  const handleManualRefresh = () => {
    if (resourceDetection.found && selectedMetrics.length > 0 && selectedInstance) {
      fetchMetrics();
    }
  };

  const handleCategoryToggle = (category: MetricCategory) => {
    const categoryMetricKeys = category.metrics.map(m => m.key);
    const areAllCategorySelected = categoryMetricKeys.every(key => 
      selectedMetrics.some(m => m.key === key)
    );

    setSelectedMetrics(prev => {
      if (areAllCategorySelected) {
        // Deselect all metrics in this category
        return prev.filter(metric => !categoryMetricKeys.includes(metric.key));
      } else {
        // Select all metrics in this category (add any that aren't already selected)
        const newMetrics = category.metrics.filter(metric => 
          !prev.some(selected => selected.key === metric.key)
        );
        return [...prev, ...newMetrics];
      }
    });
  };

  const isCategorySelected = (category: MetricCategory) => {
    const categoryMetricKeys = category.metrics.map(m => m.key);
    return categoryMetricKeys.every(key => 
      selectedMetrics.some(m => m.key === key)
    );
  };

  const isCategoryPartiallySelected = (category: MetricCategory) => {
    const categoryMetricKeys = category.metrics.map(m => m.key);
    const selectedCount = categoryMetricKeys.filter(key => 
      selectedMetrics.some(m => m.key === key)
    ).length;
    return selectedCount > 0 && selectedCount < categoryMetricKeys.length;
  };

  const isAllSelected = selectedMetrics.length === ALL_METRICS.length;
  const isNoneSelected = selectedMetrics.length === 0;

  // Show loading while detecting resource
  if (detectingResource) {
    return (
      <Box className={classes.root}>
        <Card>
          <CardContent>
            <Box className={classes.loadingContainer}>
              <Box textAlign="center">
                <CircularProgress />
                <Typography variant="body2" style={{ marginTop: 16 }}>
                  Detecting VCF Operations resource...
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // Show not implemented message
  if (resourceDetection.notImplemented) {
    return (
      <NotImplementedMessage
        entityType={resourceDetection.notImplemented.entityType}
        entityKind={resourceDetection.notImplemented.entityKind}
        reason={resourceDetection.notImplemented.reason}
      />
    );
  }

  // Show error if resource detection failed
  if (!resourceDetection.found) {
    return (
      <Box className={classes.root}>
        <Alert severity="error">
          {resourceDetection.error || 'Failed to detect VCF Operations resource'}
        </Alert>
      </Box>
    );
  }

  const resource = resourceDetection.resource!;

  return (
    <Box className={classes.root}>
      {/* Top Controls */}
      <Card className={classes.topControls}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            VCF Operations Metrics: {resource.resourceKey.name}
          </Typography>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            {resource.resourceKey.adapterKindKey} | {resource.resourceKey.resourceKindKey} | ID: {resource.identifier}
          </Typography>
          
          <Box className={classes.topControlsRow}>
            {instances.length > 1 && (
              <Box className={classes.controlGroup}>
                <FormControl className={classes.formControl}>
                  <InputLabel>Instance</InputLabel>
                  <Select
                    value={selectedInstance}
                    onChange={(e) => setSelectedInstance(e.target.value as string)}
                  >
                    {instances.map((instance) => (
                      <MenuItem key={instance.name} value={instance.name}>
                        {instance.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            )}

            <Box className={classes.controlGroup}>
              <FormControl className={classes.formControl}>
                <InputLabel>Time Range</InputLabel>
                <Select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value as number)}
                >
                  {TIME_RANGES.map((range) => (
                    <MenuItem key={range.hours} value={range.hours}>
                      {range.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Box className={classes.controlGroup}>
              <FormControl className={classes.formControl}>
                <InputLabel>Aggregation</InputLabel>
                <Select
                  value={rollUpType}
                  onChange={(e) => setRollUpType(e.target.value as string)}
                >
                  <MenuItem value="AVERAGE">Average</MenuItem>
                  <MenuItem value="MIN">Minimum</MenuItem>
                  <MenuItem value="MAX">Maximum</MenuItem>
                  <MenuItem value="SUM">Sum</MenuItem>
                  <MenuItem value="LATEST">Latest</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box className={classes.controlGroup}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    color="primary"
                  />
                }
                label="Auto-refresh (30s)"
              />
              <Button
                variant="outlined"
                size="small"
                onClick={handleManualRefresh}
                disabled={loading || isNoneSelected}
                className={classes.refreshButton}
              >
                {loading ? <CircularProgress size={16} /> : 'Refresh Now'}
              </Button>
            </Box>
          </Box>

          {/* Custom Time Range */}
          {timeRange === -1 && (
            <Box className={classes.topControlsRow} style={{ marginTop: 16 }}>
              <TextField
                label="Start Time"
                type="datetime-local"
                value={customStartTime}
                onChange={(e) => setCustomStartTime(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
                style={{ minWidth: 200 }}
              />
              <TextField
                label="End Time"
                type="datetime-local"
                value={customEndTime}
                onChange={(e) => setCustomEndTime(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
                style={{ minWidth: 200 }}
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Main Content Area */}
      <Box className={classes.mainContent}>
        {/* Left Panel - Metrics Selection */}
        <Box className={classes.leftPanel}>
          <Card className={classes.metricsCard}>
            <CardHeader 
              title="Available Metrics"
              subheader={`${selectedMetrics.length} of ${ALL_METRICS.length} selected`}
            />
            
            {/* Select All Controls */}
            <Box className={classes.selectAllContainer}>
              <Box display="flex">
                <Button
                  size="small"
                  variant={isAllSelected ? "contained" : "outlined"}
                  color="primary"
                  onClick={handleSelectAll}
                  disabled={isAllSelected}
                >
                  Select All
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleDeselectAll}
                  disabled={isNoneSelected}
                  style={{ marginLeft: 8 }}
                >
                  Clear All
                </Button>
              </Box>
            </Box>

            <CardContent className={classes.metricsCardContent}>
              {METRIC_CATEGORIES.map((category) => (
                <Box key={category.name}>
                  <Box 
                    className={classes.categoryHeaderContainer}
                    onClick={() => handleCategoryToggle(category)}
                  >
                    <Checkbox
                      checked={isCategorySelected(category)}
                      indeterminate={isCategoryPartiallySelected(category)}
                      color="primary"
                      size="small"
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => handleCategoryToggle(category)}
                    />
                    <Typography variant="subtitle2" className={classes.categoryTitle}>
                      {category.name} ({category.metrics.filter(m => selectedMetrics.some(sm => sm.key === m.key)).length}/{category.metrics.length})
                    </Typography>
                  </Box>
                  {category.metrics.map((metric) => {
                    const isSelected = selectedMetrics.some(m => m.key === metric.key);
                    return (
                      <Box 
                        key={metric.key} 
                        className={classes.metricItem}
                        onClick={() => handleMetricToggle(metric)}
                        style={{ cursor: 'pointer' }}
                      >
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={isSelected}
                              color="primary"
                              className={classes.metricCheckbox}
                            />
                          }
                          label={metric.label}
                          style={{ width: '100%', margin: 0 }}
                        />
                      </Box>
                    );
                  })}
                </Box>
              ))}
            </CardContent>
          </Card>
        </Box>

        {/* Right Panel - Charts */}
        <Box className={classes.rightPanel}>
          {error && (
            <Alert severity="error" style={{ marginBottom: 16 }}>
              {error}
            </Alert>
          )}

          {loading && (
            <Box className={classes.loadingContainer}>
              <CircularProgress />
              <Typography variant="body2" style={{ marginTop: 16 }}>
                Loading metrics data...
              </Typography>
            </Box>
          )}

          <Box className={classes.chartsContainer}>
            {metricsData.length > 0 && selectedMetrics.map((metric) => {
              const metricData = metricsData.find(
                (data) => data.stat.statKey.key === metric.key
              );

              return (
                <Card key={metric.key} className={classes.chartCard}>
                  <CardHeader 
                    title={metric.label}
                    subheader={`Resource: ${resource.resourceKey.name}`}
                  />
                  <CardContent style={{ height: 'calc(100% - 72px)' }}>
                    {metricData ? (
                      <MetricChart
                        data={metricData}
                        height={300}
                      />
                    ) : (
                      <Box className={classes.loadingContainer}>
                        <Typography variant="body2" color="textSecondary">
                          No data available for this metric
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {metricsData.length === 0 && selectedMetrics.length > 0 && !loading && !error && (
              <Alert severity="info">
                Metrics will load automatically when you select them.
              </Alert>
            )}

            {selectedMetrics.length === 0 && (
              <Alert severity="info">
                Select metrics from the left panel to view their data.
              </Alert>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};