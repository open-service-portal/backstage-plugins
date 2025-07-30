import { useEntity } from '@backstage/plugin-catalog-react';
import {
  InfoCard,
  StructuredMetadataTable,
  StatusOK,
  StatusError,
  StatusPending,
  Table,
  TableColumn,
} from '@backstage/core-components';
import { Grid, Typography, Box, Card, CardContent } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';

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
}));

interface VMClass {
  name: string;
}

interface StorageClass {
  name: string;
  limit: string;
}

interface Zone {
  name: string;
  cpuLimit: string;
  cpuReservation: string;
  memoryLimit: string;
  memoryReservation: string;
}

interface Condition {
  type: string;
  status: string;
  lastTransitionTime: string;
  reason?: string;
  message?: string;
}

export const VCFAutomationCCINamespaceDetails = () => {
  const classes = useStyles();
  const { entity } = useEntity();

  const resourceProperties = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-resource-properties'];
  const namespaceEndpoint = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-cci-namespace-endpoint'];
  const namespacePhase = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-cci-namespace-phase'];
  const resourceState = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-resource-state'];
  const syncStatus = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-resource-sync-status'];
  const createdAt = entity.metadata.annotations?.['terasky.backstage.io/vcf-automation-resource-created-at'];

  const namespaceData = resourceProperties ? JSON.parse(resourceProperties) : null;

  if (!namespaceData) {
    return (
      <InfoCard title="CCI Supervisor Namespace Details">
        <Typography>No namespace data available.</Typography>
      </InfoCard>
    );
  }

  const { status, metadata } = namespaceData;

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

  const basicInfo = {
    'Namespace Name': namespaceData.name || 'Unknown',
    'Resource ID': namespaceData.id || 'Unknown',
    'Resource Link': namespaceData.resourceLink || 'Not available',
    'Phase': namespacePhase || status?.phase || 'Unknown',
    'State': resourceState || 'Unknown',
    'Sync Status': syncStatus || 'Unknown',
    'Created At': createdAt ? new Date(createdAt).toLocaleString() : 'Unknown',
    'Existing Resource': namespaceData.existing ? 'Yes' : 'No',
  };

  const infrastructureInfo = {
    'Infrastructure ID': metadata?.['infrastructure.cci.vmware.com/id'] || 'Not available',
    'Project ID': metadata?.['infrastructure.cci.vmware.com/project-id'] || 'Not available',
    'Endpoint URL': namespaceEndpoint || status?.namespaceEndpointURL || 'Not available',
  };

  const vmClassColumns: TableColumn<VMClass>[] = [
    { title: 'VM Class Name', field: 'name' },
  ];

  const storageClassColumns: TableColumn<StorageClass>[] = [
    { title: 'Storage Class Name', field: 'name' },
    { title: 'Limit', field: 'limit' },
  ];

  const zoneColumns: TableColumn<Zone>[] = [
    { title: 'Zone Name', field: 'name' },
    { title: 'CPU Limit', field: 'cpuLimit' },
    { title: 'CPU Reservation', field: 'cpuReservation' },
    { title: 'Memory Limit', field: 'memoryLimit' },
    { title: 'Memory Reservation', field: 'memoryReservation' },
  ];

  const conditionColumns: TableColumn<Condition>[] = [
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

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <InfoCard title="Basic Information">
          <StructuredMetadataTable metadata={basicInfo} />
        </InfoCard>
      </Grid>

      <Grid item xs={12}>
        <InfoCard title="Infrastructure Details">
          <StructuredMetadataTable metadata={infrastructureInfo} />
        </InfoCard>
      </Grid>

      {status?.conditions && status.conditions.length > 0 && (
        <Grid item xs={12}>
          <InfoCard title="Namespace Conditions">
            <Table
              columns={conditionColumns}
              data={status.conditions}
              options={{
                search: true,
                paging: false,
                padding: 'dense',
              }}
            />
          </InfoCard>
        </Grid>
      )}

      {status?.vmClasses && status.vmClasses.length > 0 && (
        <Grid item xs={12} md={6}>
          <InfoCard title="Available VM Classes">
            <Table
              columns={vmClassColumns}
              data={status.vmClasses}
              options={{
                search: true,
                paging: status.vmClasses.length > 10,
                pageSize: 10,
                padding: 'dense',
              }}
            />
          </InfoCard>
        </Grid>
      )}

      {status?.storageClasses && status.storageClasses.length > 0 && (
        <Grid item xs={12} md={6}>
          <InfoCard title="Storage Classes">
            <Table
              columns={storageClassColumns}
              data={status.storageClasses}
              options={{
                search: true,
                paging: false,
                padding: 'dense',
              }}
            />
          </InfoCard>
        </Grid>
      )}

      {status?.zones && status.zones.length > 0 && (
        <Grid item xs={12}>
          <InfoCard title="Resource Zones">
            <Table
              columns={zoneColumns}
              data={status.zones}
              options={{
                search: true,
                paging: false,
                padding: 'dense',
              }}
            />
          </InfoCard>
        </Grid>
      )}

      {status && (
        <Grid item xs={12}>
          <InfoCard title="Namespace Status Summary">
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Card className={classes.statusCard}>
                  <CardContent>
                    <Typography variant="h6" color="textSecondary">
                      Phase
                    </Typography>
                    <Typography variant="h4">
                      {status.phase || 'Unknown'}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card className={classes.statusCard}>
                  <CardContent>
                    <Typography variant="h6" color="textSecondary">
                      VM Classes
                    </Typography>
                    <Typography variant="h4">
                      {status.vmClasses?.length || 0}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card className={classes.statusCard}>
                  <CardContent>
                    <Typography variant="h6" color="textSecondary">
                      Storage Classes
                    </Typography>
                    <Typography variant="h4">
                      {status.storageClasses?.length || 0}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card className={classes.statusCard}>
                  <CardContent>
                    <Typography variant="h6" color="textSecondary">
                      Zones
                    </Typography>
                    <Typography variant="h4">
                      {status.zones?.length || 0}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </InfoCard>
        </Grid>
      )}
    </Grid>
  );
};