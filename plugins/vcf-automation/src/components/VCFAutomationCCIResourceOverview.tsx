import { useMemo } from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { useApi } from '@backstage/core-plugin-api';
import { vcfAutomationApiRef } from '../api/VcfAutomationClient';
import {
  InfoCard,
  StructuredMetadataTable,
  CodeSnippet,
  StatusOK,
  StatusError,
  StatusPending,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { Grid, Typography, Chip, Box, Accordion, AccordionSummary, AccordionDetails } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import yaml from 'js-yaml';
import useAsync from 'react-use/lib/useAsync';

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
  yamlContainer: {
    '& .MuiAccordionSummary-root': {
      minHeight: 48,
    },
  },
  dependencyChip: {
    margin: theme.spacing(0.25),
    cursor: 'pointer',
  },
}));

export const VCFAutomationCCIResourceOverview = () => {
  const classes = useStyles();
  const { entity } = useEntity();
  const api = useApi(vcfAutomationApiRef);

  // Extract stable values from entity
  const deploymentId = entity.spec?.system as string;
  const resourceId = entity.metadata.name;
  const instanceName = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-instance'];

  // Check if this is a standalone resource
  const isStandalone = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-resource-origin'] === 'STANDALONE';

  // Parse annotation data once using useMemo
  const annotationData = useMemo(() => {
    const resourceProperties = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-resource-properties'];
    const resourceManifest = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-cci-resource-manifest'];
    const resourceObject = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-cci-resource-object'];
    const resourceContext = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-cci-resource-context'];
    
    return {
      resourceData: resourceProperties && resourceProperties !== '{}' ? JSON.parse(resourceProperties) : null,
      manifest: resourceManifest && resourceManifest !== '{}' ? JSON.parse(resourceManifest) : null,
      objectData: resourceObject && resourceObject !== '{}' ? JSON.parse(resourceObject) : null,
      resourceContext: resourceContext || '',
    };
  }, [
    entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-resource-properties'],
    entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-cci-resource-manifest'],
    entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-cci-resource-object'],
    entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-cci-resource-context'],
  ]);

  // Check if we need to make API call
  const needsApiCall = !annotationData.resourceData || !annotationData.manifest || !annotationData.objectData;

  // Fallback API call if annotation data is missing or empty
  const { value: apiResourceData, loading, error } = useAsync(async () => {
    if (!needsApiCall || !resourceId) {
      return null;
    }

    try {
      if (isStandalone) {
        // For standalone resources, fetch directly by resource ID
        const response = await api.getSupervisorResource(resourceId, instanceName);
        if (response) {
          // Transform standalone resource data to match expected structure
          return {
            id: response.id,
            properties: {
              manifest: {
                apiVersion: response.apiVersion,
                kind: response.kind,
                metadata: response.metadata,
                spec: response.spec,
              },
              object: {
                apiVersion: response.apiVersion,
                kind: response.kind,
                metadata: response.metadata,
                spec: response.spec,
                status: response.status,
              },
              context: JSON.stringify({
                namespace: response.metadata.namespace,
                apiVersion: response.apiVersion,
                kind: response.kind,
                standalone: true,
              }),
            },
          };
        }
      } else {
        // For deployment-managed resources, use existing logic
        if (!deploymentId) {
          return null;
        }
        
        const response = await api.getDeploymentResources(deploymentId, instanceName);
        let resources = null;
        if (response) {
          // Handle both direct array and paginated response with content wrapper
          if (Array.isArray(response)) {
            resources = response;
          } else if (response.content && Array.isArray(response.content)) {
            resources = response.content;
          }
        }
        if (resources) {
          return resources.find((r: any) => r.id === resourceId);
        }
      }
      return null;
    } catch (apiError) {
      console.error('Failed to fetch resource data:', apiError);
      return null;
    }
  }, [needsApiCall, isStandalone, deploymentId, resourceId, instanceName]);

  // Determine final data to use
  const resourceData = annotationData.resourceData || apiResourceData;
  const manifest = annotationData.manifest || apiResourceData?.properties?.manifest;
  const objectData = annotationData.objectData || apiResourceData?.properties?.object;
  const resourceContext = annotationData.resourceContext || apiResourceData?.properties?.context;

  if (loading) {
    return (
      <InfoCard title="CCI Supervisor Resource">
        <Progress />
      </InfoCard>
    );
  }

  if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  if (!resourceData) {
    return (
      <InfoCard title="CCI Supervisor Resource">
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
    'Resource Name': resourceData.id || 'Unknown',
    'Context': resourceContext || 'Unknown',
    'Resource Link': resourceData.resourceLink || 'Not available',
    'Count': resourceData.count?.toString() || 'N/A',
    'Count Index': resourceData.countIndex?.toString() || 'N/A',
    'Existing': resourceData.existing ? 'Yes' : 'No',
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
    
    return Object.keys(statusInfo).length > 0 ? statusInfo : null;
  };

  const objectStatus = getObjectStatus();

  return (
    <InfoCard title="CCI Supervisor Resource Overview">
      <Grid container spacing={3}>
        {isStandalone && (
          <Grid item xs={12}>
            <Box mb={2}>
              <Chip
                label="Standalone Resource"
                color="secondary"
                variant="outlined"
                size="small"
              />
            </Box>
          </Grid>
        )}
        <Grid item xs={12}>
          <Typography variant="h6" className={classes.sectionTitle}>
            Basic Information
          </Typography>
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

        {resourceData.wait?.conditions && resourceData.wait.conditions.length > 0 && (
          <Grid item xs={12}>
            <Typography variant="h6" className={classes.sectionTitle}>
              Wait Conditions
            </Typography>
            <Box>
              {resourceData.wait.conditions.map((condition: any, index: number) => (
                <Box key={index} display="flex" alignItems="center" mb={1}>
                  {renderStatusIcon(condition.status)}
                  <Chip
                    label={`${condition.type}: ${condition.status}`}
                    size="small"
                    className={classes.conditionChip}
                    color={condition.status === 'True' ? 'primary' : 'default'}
                  />
                </Box>
              ))}
            </Box>
          </Grid>
        )}

        {objectData?.status?.conditions && objectData.status.conditions.length > 0 && (
          <Grid item xs={12}>
            <Typography variant="h6" className={classes.sectionTitle}>
              Resource Conditions
            </Typography>
            <Box>
              {objectData.status.conditions.map((condition: any, index: number) => (
                <Box key={index} display="flex" alignItems="center" mb={1}>
                  {renderStatusIcon(condition.status)}
                  <Chip
                    label={`${condition.type}: ${condition.status}`}
                    size="small"
                    className={classes.conditionChip}
                    color={condition.status === 'True' ? 'primary' : 'default'}
                  />
                  <Typography variant="caption" style={{ marginLeft: 8 }}>
                    {condition.lastTransitionTime}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Grid>
        )}

        {objectStatus && (
          <Grid item xs={12}>
            <Typography variant="h6" className={classes.sectionTitle}>
              Resource Status
            </Typography>
            <StructuredMetadataTable metadata={objectStatus} />
          </Grid>
        )}

        {manifest && (
          <Grid item xs={12}>
            <Accordion className={classes.yamlContainer}>
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
                      maxHeight: '500px',
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
                <Typography variant="h6">Kubernetes Object</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box width="100%">
                  <CodeSnippet
                    text={formatYaml(objectData)}
                    language="yaml"
                    showLineNumbers
                    customStyle={{ 
                      fontSize: '12px',
                      maxHeight: '500px',
                      overflow: 'auto'
                    }}
                  />
                </Box>
              </AccordionDetails>
            </Accordion>
          </Grid>
        )}
      </Grid>
    </InfoCard>
  );
};