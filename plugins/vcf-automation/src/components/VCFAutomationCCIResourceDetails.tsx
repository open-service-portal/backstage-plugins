import { useEntity } from '@backstage/plugin-catalog-react';
import {
  InfoCard,
  StructuredMetadataTable,
  StatusOK,
  StatusError,
  StatusPending,
  Table,
  TableColumn,
  CodeSnippet,
} from '@backstage/core-components';
import { 
  Grid, 
  Typography, 
  Chip, 
  Box, 
  Card, 
  CardContent, 
  Tabs, 
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import yaml from 'js-yaml';
import { useState } from 'react';

const useStyles = makeStyles(theme => ({
  statusChip: {
    marginRight: theme.spacing(1),
    marginBottom: theme.spacing(0.5),
  },
  sectionTitle: {
    marginBottom: theme.spacing(2),
  },
  conditionChip: {
    margin: theme.spacing(0.25),
  },
  card: {
    marginBottom: theme.spacing(2),
  },
  statusCard: {
    border: `1px solid ${theme.palette.divider}`,
  },
  dependencyChip: {
    margin: theme.spacing(0.25),
    cursor: 'pointer',
  },
  yamlContainer: {
    '& .MuiAccordionSummary-root': {
      minHeight: 48,
    },
  },
  tabPanel: {
    paddingTop: theme.spacing(2),
  },
}));

interface Condition {
  type: string;
  status: string;
  lastTransitionTime?: string;
  reason?: string;
  message?: string;
}

interface WaitCondition {
  type: string;
  status: string;
}

function TabPanel(props: { children?: React.ReactNode; index: number; value: number }) {
  const { children, value, index } = props;
  const classes = useStyles();

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`resource-tabpanel-${index}`}
      aria-labelledby={`resource-tab-${index}`}
    >
      {value === index && (
        <Box className={classes.tabPanel}>
          {children}
        </Box>
      )}
    </div>
  );
}

export const VCFAutomationCCIResourceDetails = () => {
  const classes = useStyles();
  const { entity } = useEntity();
  const [tabValue, setTabValue] = useState(0);

  const resourceProperties = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-resource-properties'];
  const resourceManifest = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-cci-resource-manifest'];
  const resourceObject = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-cci-resource-object'];
  const resourceContext = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-cci-resource-context'];
  const resourceState = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-resource-state'];
  const syncStatus = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-resource-sync-status'];
  const createdAt = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-resource-created-at'];
  const origin = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-resource-origin'];

  const resourceData = resourceProperties ? JSON.parse(resourceProperties) : null;
  const manifest = resourceManifest ? JSON.parse(resourceManifest) : null;
  const objectData = resourceObject ? JSON.parse(resourceObject) : null;

  const handleTabChange = (_event: React.ChangeEvent<{}>, newValue: number) => {
    setTabValue(newValue);
  };

  if (!resourceData) {
    return (
      <InfoCard title="CCI Supervisor Resource Details">
        <Typography>No resource data available.</Typography>
      </InfoCard>
    );
  }

  const renderStatusIcon = (conditionStatus: string) => {
    switch (conditionStatus.toLowerCase()) {
      case 'true':
        return <StatusOK />;
      case 'false':
        return <StatusError />;
      default:
        return <StatusPending />;
    }
  };

  const reorderKubernetesResource = (data: any) => {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // Standard Kubernetes resource field order
    const orderedFields = ['apiVersion', 'kind', 'metadata', 'spec', 'status', 'data'];
    const reordered: any = {};

    // Add fields in the correct order
    orderedFields.forEach(field => {
      if (data[field] !== undefined) {
        reordered[field] = data[field];
      }
    });

    // Add any remaining fields that weren't in our standard list
    Object.keys(data).forEach(field => {
      if (!orderedFields.includes(field)) {
        reordered[field] = data[field];
      }
    });

    return reordered;
  };

  const formatYaml = (data: any) => {
    try {
      const reorderedData = reorderKubernetesResource(data);
      return yaml.dump(reorderedData, { 
        indent: 2, 
        lineWidth: -1,
        noRefs: true,
        sortKeys: false 
      });
    } catch (error) {
      return JSON.stringify(data, null, 2);
    }
  };

  const basicInfo = {
    'Resource Name': entity.metadata.title || entity.metadata.name,
    'Resource ID': resourceData.id || 'Unknown',
    'Context': resourceContext || 'Unknown',
    'Resource Link': resourceData.resourceLink || 'Not available',
    'Count': resourceData.count?.toString() || 'N/A',
    'Count Index': resourceData.countIndex?.toString() || 'N/A',
    'Existing': resourceData.existing ? 'Yes' : 'No',
    'State': resourceState || 'Unknown',
    'Sync Status': syncStatus || 'Unknown',
    'Origin': origin || 'Unknown',
    'Created At': createdAt ? new Date(createdAt).toLocaleString() : 'Unknown',
  };

  const getManifestInfo = () => {
    if (!manifest) return {};
    
    const info: any = {};
    if (manifest.kind) info['Kind'] = manifest.kind;
    if (manifest.apiVersion) info['API Version'] = manifest.apiVersion;
    if (manifest.metadata?.name) info['Manifest Name'] = manifest.metadata.name;
    if (manifest.metadata?.namespace) info['Namespace'] = manifest.metadata.namespace;
    if (manifest.metadata?.labels) {
      const labelCount = Object.keys(manifest.metadata.labels).length;
      info['Labels'] = `${labelCount} label(s)`;
    }
    if (manifest.metadata?.annotations) {
      const annotationCount = Object.keys(manifest.metadata.annotations).length;
      info['Annotations'] = `${annotationCount} annotation(s)`;
    }
    
    return info;
  };

  const getObjectStatus = () => {
    if (!objectData?.status) return null;
    
    const status = objectData.status;
    const statusInfo: any = {};
    
    if (status.powerState) statusInfo['Power State'] = status.powerState;
    if (status.phase) statusInfo['Phase'] = status.phase;
    if (status.primaryIP4) statusInfo['Primary IP'] = status.primaryIP4;
    if (status.host) statusInfo['Host'] = status.host;
    if (status.zone) statusInfo['Zone'] = status.zone;
    if (status.uniqueID) statusInfo['Unique ID'] = status.uniqueID;
    if (status.instanceUUID) statusInfo['Instance UUID'] = status.instanceUUID;
    if (status.biosUUID) statusInfo['BIOS UUID'] = status.biosUUID;
    if (status.hardwareVersion) statusInfo['Hardware Version'] = status.hardwareVersion;
    if (status.changeBlockTracking !== undefined) statusInfo['Change Block Tracking'] = status.changeBlockTracking ? 'Enabled' : 'Disabled';
    
    return Object.keys(statusInfo).length > 0 ? statusInfo : null;
  };

  const manifestInfo = getManifestInfo();
  const objectStatus = getObjectStatus();

  const waitConditionColumns: TableColumn<WaitCondition>[] = [
    { 
      title: 'Status', 
      field: 'status',
      render: (rowData) => (
        <Box display="flex" alignItems="center">
          {renderStatusIcon(rowData.status)}
          <span style={{ marginLeft: 8 }}>{rowData.status}</span>
        </Box>
      ),
    },
    { title: 'Type', field: 'type' },
  ];

  const resourceConditionColumns: TableColumn<Condition>[] = [
    { 
      title: 'Status', 
      field: 'status',
      render: (rowData) => (
        <Box display="flex" alignItems="center">
          {renderStatusIcon(rowData.status)}
          <span style={{ marginLeft: 8 }}>{rowData.status}</span>
        </Box>
      ),
    },
    { title: 'Type', field: 'type' },
    { title: 'Last Transition', field: 'lastTransitionTime' },
    { title: 'Reason', field: 'reason' },
    { title: 'Message', field: 'message' },
  ];

  const getNetworkInfo = () => {
    if (!objectData?.status?.network) return null;
    
    const network = objectData.status.network;
    const networkInfo: any = {};
    
    if (network.primaryIP4) networkInfo['Primary IPv4'] = network.primaryIP4;
    if (network.interfaces && network.interfaces.length > 0) {
      networkInfo['Network Interfaces'] = `${network.interfaces.length} interface(s)`;
      
      network.interfaces.forEach((iface: any, index: number) => {
        if (iface.ip?.macAddr) networkInfo[`Interface ${index + 1} MAC`] = iface.ip.macAddr;
        if (iface.ip?.addresses && iface.ip.addresses.length > 0) {
          const primaryAddr = iface.ip.addresses.find((addr: any) => addr.state === 'preferred');
          if (primaryAddr) networkInfo[`Interface ${index + 1} IP`] = primaryAddr.address;
        }
      });
    }
    
    return Object.keys(networkInfo).length > 0 ? networkInfo : null;
  };

  const networkInfo = getNetworkInfo();

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <InfoCard title="Resource Overview">
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Card className={classes.statusCard}>
                <CardContent>
                  <Typography variant="h6" color="textSecondary">
                    State
                  </Typography>
                  <Typography variant="h4">
                    {resourceState || 'Unknown'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card className={classes.statusCard}>
                <CardContent>
                  <Typography variant="h6" color="textSecondary">
                    Sync Status
                  </Typography>
                  <Typography variant="h4">
                    {syncStatus || 'Unknown'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card className={classes.statusCard}>
                <CardContent>
                  <Typography variant="h6" color="textSecondary">
                    Kind
                  </Typography>
                  <Typography variant="h4">
                    {manifest?.kind || 'Unknown'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card className={classes.statusCard}>
                <CardContent>
                  <Typography variant="h6" color="textSecondary">
                    Power State
                  </Typography>
                  <Typography variant="h4">
                    {objectData?.status?.powerState || 'Unknown'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </InfoCard>
      </Grid>

      <Grid item xs={12}>
        <InfoCard>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="resource details tabs">
            <Tab label="Basic Information" />
            <Tab label="Manifest Details" />
            <Tab label="Object Status" />
            <Tab label="Conditions" />
            <Tab label="YAML Views" />
          </Tabs>

          <TabPanel value={tabValue} index={0}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <StructuredMetadataTable metadata={basicInfo} />
              </Grid>
              
              {entity.spec?.dependsOn && Array.isArray(entity.spec.dependsOn) && entity.spec.dependsOn.length > 0 && (
                <Grid item xs={12}>
                  <Typography variant="h6" className={classes.sectionTitle}>
                    Dependencies
                  </Typography>
                  <Box>
                    {entity.spec.dependsOn
                      .filter((dep): dep is string => typeof dep === 'string')
                      .map((dep: string, index: number) => (
                        <Chip
                          key={index}
                          label={dep}
                          size="small"
                          className={classes.dependencyChip}
                          color="primary"
                          variant="outlined"
                        />
                      ))}
                  </Box>
                </Grid>
              )}
            </Grid>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Grid container spacing={3}>
              {Object.keys(manifestInfo).length > 0 && (
                <Grid item xs={12}>
                  <Typography variant="h6" className={classes.sectionTitle}>
                    Manifest Information
                  </Typography>
                  <StructuredMetadataTable metadata={manifestInfo} />
                </Grid>
              )}
              
              {manifest?.metadata?.labels && (
                <Grid item xs={12}>
                  <Typography variant="h6" className={classes.sectionTitle}>
                    Labels
                  </Typography>
                  <StructuredMetadataTable metadata={manifest.metadata.labels} />
                </Grid>
              )}
            </Grid>
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <Grid container spacing={3}>
              {objectStatus && (
                <Grid item xs={12}>
                  <Typography variant="h6" className={classes.sectionTitle}>
                    Object Status
                  </Typography>
                  <StructuredMetadataTable metadata={objectStatus} />
                </Grid>
              )}
              
              {networkInfo && (
                <Grid item xs={12}>
                  <Typography variant="h6" className={classes.sectionTitle}>
                    Network Information
                  </Typography>
                  <StructuredMetadataTable metadata={networkInfo} />
                </Grid>
              )}
            </Grid>
          </TabPanel>

          <TabPanel value={tabValue} index={3}>
            <Grid container spacing={3}>
              {resourceData.wait?.conditions && resourceData.wait.conditions.length > 0 && (
                <Grid item xs={12}>
                  <Typography variant="h6" className={classes.sectionTitle}>
                    Wait Conditions
                  </Typography>
                  <Table
                    columns={waitConditionColumns}
                    data={resourceData.wait.conditions}
                    options={{
                      search: false,
                      paging: false,
                      padding: 'dense',
                    }}
                  />
                </Grid>
              )}

              {objectData?.status?.conditions && objectData.status.conditions.length > 0 && (
                <Grid item xs={12}>
                  <Typography variant="h6" className={classes.sectionTitle}>
                    Resource Conditions
                  </Typography>
                  <Table
                    columns={resourceConditionColumns}
                    data={objectData.status.conditions}
                    options={{
                      search: true,
                      paging: objectData.status.conditions.length > 10,
                      pageSize: 10,
                      padding: 'dense',
                    }}
                  />
                </Grid>
              )}
            </Grid>
          </TabPanel>

          <TabPanel value={tabValue} index={4}>
            <Grid container spacing={3}>
              {manifest && (
                <Grid item xs={12}>
                  <Accordion className={classes.yamlContainer} defaultExpanded>
                    <AccordionSummary
                      expandIcon={<ExpandMoreIcon />}
                      aria-controls="manifest-content"
                      id="manifest-header"
                    >
                      <Typography variant="h6">Resource Manifest</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Box width="100%">
                        <CodeSnippet
                          text={formatYaml(manifest)}
                          language="yaml"
                          showLineNumbers
                          customStyle={{ 
                            fontSize: '12px',
                            maxHeight: '600px',
                            overflow: 'auto'
                          }}
                        />
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                </Grid>
              )}

              {objectData && (
                <Grid item xs={12}>
                  <Accordion className={classes.yamlContainer}>
                    <AccordionSummary
                      expandIcon={<ExpandMoreIcon />}
                      aria-controls="object-content"
                      id="object-header"
                    >
                      <Typography variant="h6">Live Kubernetes Object</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Box width="100%">
                        <CodeSnippet
                          text={formatYaml(objectData)}
                          language="yaml"
                          showLineNumbers
                          customStyle={{ 
                            fontSize: '12px',
                            maxHeight: '600px',
                            overflow: 'auto'
                          }}
                        />
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                </Grid>
              )}
            </Grid>
          </TabPanel>
        </InfoCard>
      </Grid>
    </Grid>
  );
};