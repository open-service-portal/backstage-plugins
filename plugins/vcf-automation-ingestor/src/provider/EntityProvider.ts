import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { Config } from '@backstage/config';
import { LoggerService, SchedulerService } from '@backstage/backend-plugin-api';
import {
  ANNOTATION_LOCATION,
  ANNOTATION_ORIGIN_LOCATION,
  ComponentEntity,
  DomainEntity,
  ResourceEntity,
  SystemEntity,
} from '@backstage/catalog-model';
import fetch from 'node-fetch';

/**
 * Represents a resource in a VCF Automation deployment
 */
interface VcfDeploymentResource {
  id: string;
  name: string;
  type: string;
  properties: {
    [key: string]: any;
  };
  dependsOn?: string[];
  metadata: {
    [key: string]: any;
  };
  createdAt: string;
  origin: string;
  syncStatus: string;
  state: string;
}

interface VcfDeploymentLastRequest {
  id: string;
  name: string;
  requestedBy: string;
  actionId: string;
  deploymentId: string;
  resourceIds: string[];
  status: string;
  details: string;
  createdAt: string;
  updatedAt: string;
  totalTasks: number;
  completedTasks: number;
}

interface VcfDeploymentExpense {
  totalExpense: number;
  computeExpense: number;
  storageExpense: number;
  additionalExpense: number;
  unit: string;
  lastUpdatedTime: string;
}

/**
 * Represents a VCF Automation deployment
 */
interface VcfDeployment {
  id: string;
  name: string;
  ownedBy: string;
  ownerType: string;
  project: {
    id: string;
    name: string;
  };
  resources: VcfDeploymentResource[];
  status: string;
  expense: VcfDeploymentExpense;
  createdAt: string;
  createdBy: string;
  lastUpdatedAt: string;
  lastUpdatedBy: string;
  lastRequest: VcfDeploymentLastRequest;
}

interface VcfDeploymentResponse {
  content: VcfDeployment[];
  totalPages: number;
  number: number;
}

interface VcfInstance {
  baseUrl: string;
  name: string;
  majorVersion: number;
  authentication: {
    username: string;
    password: string;
    domain: string;
  };
  orgName?: string;
  organizationType?: 'vm-apps' | 'all-apps';
  token?: string;
  tokenExpiry?: Date;
}

export class VcfAutomationEntityProvider implements EntityProvider {

  private readonly scheduler: SchedulerService;
  private connection?: EntityProviderConnection;
  private readonly logger: LoggerService;
  private readonly instances: VcfInstance[];

  constructor(config: Config, scheduler: SchedulerService, logger: LoggerService) {
    this.scheduler = scheduler;
    this.logger = logger;

    // Get instances configuration
    let instances: VcfInstance[] = [];
    
    try {
      // First try to get instances array
      const instancesConfig = config.getOptionalConfigArray('vcfAutomation.instances');
      
      if (instancesConfig && instancesConfig.length > 0) {
        // Multi-instance configuration
        instances = instancesConfig.map(instanceConfig => {
          const baseUrl = instanceConfig.getOptionalString('baseUrl') ?? "";
          return {
            baseUrl,
            name: instanceConfig.getOptionalString('name') ?? new URL(baseUrl).hostname.split(".")[0],
            majorVersion: instanceConfig.getOptionalNumber('majorVersion') ?? 8,
            authentication: {
              username: instanceConfig.getOptionalString('authentication.username') ?? "",
              password: instanceConfig.getOptionalString('authentication.password') ?? "",
              domain: instanceConfig.getOptionalString('authentication.domain') ?? "",
            },
            orgName: instanceConfig.getOptionalString('orgName'),
            organizationType: instanceConfig.getOptionalString('organizationType') as 'vm-apps' | 'all-apps' ?? 'vm-apps',
          };
        });
      } else {
        // Legacy single instance configuration
        const baseUrl = config.getOptionalString('vcfAutomation.baseUrl') ?? "";
        instances = [{
          baseUrl,
          name: config.getOptionalString('vcfAutomation.name') ?? new URL(baseUrl).hostname.split(".")[0],
          majorVersion: config.getOptionalNumber('vcfAutomation.majorVersion') ?? 8,
          authentication: {
            username: config.getOptionalString('vcfAutomation.authentication.username') ?? "",
            password: config.getOptionalString('vcfAutomation.authentication.password') ?? "",
            domain: config.getOptionalString('vcfAutomation.authentication.domain') ?? "",
          },
          orgName: config.getOptionalString('vcfAutomation.orgName'),
          organizationType: config.getOptionalString('vcfAutomation.organizationType') as 'vm-apps' | 'all-apps' ?? 'vm-apps',
        }];
      }
    } catch (error) {
      this.logger.error('Failed to read VCF Automation configuration', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('Failed to initialize VCF Automation provider: Invalid configuration');
    }

    if (instances.length === 0) {
      throw new Error('No VCF Automation instances configured');
    }

    this.instances = instances;
    this.logger.info(`VcfAutomationEntityProvider initialized with ${instances.length} instance(s)`);
  }

  getProviderName(): string {
    return 'vcf-automation';
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.logger.info('Connecting VcfAutomationEntityProvider');
    this.connection = connection;
    
    try {
      await this.scheduler.scheduleTask({
        id: 'refresh_vcf_automation_entities',
        frequency: { minutes: 30 },
        timeout: { minutes: 10 },
        fn: async () => {
          this.logger.info('Starting scheduled refresh of VCF Automation entities');
          await this.refresh();
        },
      });
      this.logger.info('Successfully scheduled refresh task');
      
      // Trigger an initial refresh
      await this.refresh();
    } catch (error) {
      this.logger.error('Failed to schedule refresh task', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async authenticate(instance: VcfInstance): Promise<void> {
    try {
      if (instance.token && instance.tokenExpiry && instance.tokenExpiry > new Date()) {
        this.logger.debug(`Using existing valid token for instance ${instance.name}`);
        return;
      }

      this.logger.debug(`Authenticating with VCF Automation instance ${instance.name} (version ${instance.majorVersion})`);
      
      if (instance.majorVersion >= 9) {
        // Version 9+ authentication using vCloud Director API
        const username = instance.orgName 
          ? `${instance.authentication.username}@${instance.orgName}`
          : instance.authentication.username;
        
        const basicAuth = Buffer.from(`${username}:${instance.authentication.password}`).toString('base64');
        
        const response = await fetch(`${instance.baseUrl}/cloudapi/1.0.0/sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json;version=40.0',
            'Authorization': `Basic ${basicAuth}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Authentication failed with VCF Automation instance ${instance.name} with status ${response.status}: ${response.statusText}`);
        }

        const accessToken = response.headers.get('x-vmware-vcloud-access-token');
        if (!accessToken) {
          throw new Error(`No access token received from VCF Automation instance ${instance.name}`);
        }

        instance.token = accessToken;
        // Version 9+ tokens expire after 1 hour
        instance.tokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
        this.logger.debug(`Successfully authenticated with VCF Automation instance ${instance.name} (version 9+)`);
      } else {
        // Version 8 authentication using CSP API
        const response = await fetch(`${instance.baseUrl}/csp/gateway/am/api/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(instance.authentication),
        });

        if (!response.ok) {
          throw new Error(`Authentication failed with VCF Automation instance ${instance.name} with status ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        instance.token = data.cspAuthToken;
        // Version 8 tokens expire after 24 hours
        instance.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
        this.logger.debug(`Successfully authenticated with VCF Automation instance ${instance.name} (version 8)`);
      }
    } catch (error) {
      this.logger.error(`Authentication failed with VCF Automation instance ${instance.name}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async fetchDeployments(instance: VcfInstance): Promise<VcfDeployment[]> {
    try {
      await this.authenticate(instance);
      const deployments: VcfDeployment[] = [];
      let page = 0;
      let hasMorePages = true;

      this.logger.info(`Starting to fetch deployments from VCF Automation instance ${instance.name}`);

      while (hasMorePages) {
        this.logger.debug(`Fetching deployments page ${page + 1} from instance ${instance.name}`);
        const response = await fetch(
          `${instance.baseUrl}/deployment/api/deployments?page=${page}&size=10&sort=createdAt%2CDESC&expand=blueprint&expand=catalog&expand=lastRequest&expand=project&expand=resources&expand=metadata&expand=user&deleted=false`,
          {
            headers: {
              Authorization: `Bearer ${instance.token}`,
            },
          },
        );

        // If we get a 404, it means we've gone past the last page
        if (response.status === 404) {
          this.logger.debug(`No more pages available after page ${page} from instance ${instance.name}`);
          break;
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch deployments page ${page + 1} from instance ${instance.name} with status ${response.status}: ${response.statusText}`);
        }

        const data: VcfDeploymentResponse = await response.json();
        
        if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
          this.logger.debug(`No more deployments found after page ${page} from instance ${instance.name}`);
          break;
        }

        this.logger.debug(`Retrieved ${data.content.length} deployments from page ${page + 1} from instance ${instance.name}`);
        deployments.push(...data.content);

        // Check if we've reached the last page
        if (page >= data.totalPages - 1 || data.content.length === 0) {
          hasMorePages = false;
        } else {
          page++;
        }
      }

      this.logger.info(`Successfully fetched ${deployments.length} deployments in total from instance ${instance.name}`);
      return deployments;
    } catch (error) {
      this.logger.error(`Failed to fetch deployments from VCF Automation instance ${instance.name}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async refresh(): Promise<void> {
    if (!this.connection) {
      this.logger.error('Cannot refresh - provider not initialized');
      throw new Error('Not initialized');
    }

    try {
      this.logger.info('Starting refresh of VCF Automation entities');
      
      const allEntities = [];
      for (const instance of this.instances) {
        try {
          const deployments = await this.fetchDeployments(instance);
          this.logger.debug(`Transforming ${deployments.length} deployments into entities for instance ${instance.name}`);
          const entities = await this.transformToEntities(deployments, instance);
          allEntities.push(...entities);
        } catch (error) {
          this.logger.error(`Failed to process instance ${instance.name}`, {
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue with other instances even if one fails
          continue;
        }
      }
      
      this.logger.debug(`Created ${allEntities.length} entities in total, applying mutation`);
      
      await this.connection.applyMutation({
        type: 'full',
        entities: allEntities,
      });
      
      this.logger.info('Successfully completed refresh of VCF Automation entities');
    } catch (error) {
      this.logger.error('Failed to refresh VCF Automation entities', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async transformToEntities(deployments: VcfDeployment[], instance: VcfInstance) {
    const entities: Array<SystemEntity | ComponentEntity | ResourceEntity | DomainEntity> = [];
    const domains = new Set<string>();
    const locationRef = `url:${instance.baseUrl}/vcf-automation`;

    // First, create a map of ALL resource IDs to their types and names
    const resourceMap = new Map<string, { type: string; name: string; deploymentId: string }>();
    // Create a map of resource names to their IDs within each deployment
    const deploymentResourceNameMap = new Map<string, Map<string, string>>();

    for (const deployment of deployments) {
      // Initialize the name-to-id map for this deployment
      const nameToIdMap = new Map<string, string>();
      for (const resource of deployment.resources) {
        resourceMap.set(resource.id, {
          type: resource.type,
          name: resource.name,
          deploymentId: deployment.id,
        });
        // Map the resource name to its ID within this deployment
        nameToIdMap.set(resource.name, resource.id);
      }
      deploymentResourceNameMap.set(deployment.id, nameToIdMap);
    }

    this.logger.debug(`Created resource map with ${resourceMap.size} resources for instance ${instance.name}`);

    // Helper function to get the entity reference with the correct kind
    const getEntityRef = (resourceId: string): string => {
      const resource = resourceMap.get(resourceId);
      if (!resource) {
        this.logger.warn(`Could not find resource info for ${resourceId} in map of ${resourceMap.size} resources`);
        return `resource:default/unknown-resource`;
      }
      return resource.type === 'Cloud.vSphere.Machine'
        ? `component:default/${resourceId.toLowerCase()}`
        : `resource:default/${resourceId.toLowerCase()}`;
    };

    for (const deployment of deployments) {
      // Create Domain (Project) entity if not already created
      if (!domains.has(deployment.project.id)) {
        domains.add(deployment.project.id);
        
        // Generate version-specific links for Domain entities
        const domainLinks = [];
        if (instance.majorVersion >= 9) {
          // Version 9+ links - different URLs based on organization type
          if (instance.organizationType === 'all-apps') {
            domainLinks.push({
              url: `${instance.baseUrl}/automation/#/build-and-deploy/all-resources/deployments?projects=%5B"${deployment.project.id}"%5D`,
              title: 'View Project Deployments in VCF Automation',
            });
            domainLinks.push({
              url: `${instance.baseUrl}/automation/#/manage-and-govern/projects/edit/${deployment.project.id}/summary`,
              title: 'Edit Project in VCF Automation',
            });
          } else {
            // vm-apps (classic) organization type
            domainLinks.push({
              url: `${instance.baseUrl}/automation/#/consume/deployment?projects=%5B"${deployment.project.id}"%5D`,
              title: 'View Project Deployments in VCF Automation',
            });
            domainLinks.push({
              url: `${instance.baseUrl}/automation/#/infrastructure/projects/edit/${deployment.project.id}`,
              title: 'Edit Project in VCF Automation',
            });
          }
        } else {
          // Version 8 links
          domainLinks.push({
            url: `${instance.baseUrl}/automation/#/service/catalog/consume/deployment?projects=%5B"${deployment.project.id}"%5D`,
            title: 'Open in VCF Automation',
          });
        }
        
        const domainViewUrl = instance.majorVersion >= 9 
          ? (instance.organizationType === 'all-apps'
              ? `${instance.baseUrl}/automation/#/build-and-deploy/all-resources/deployments?projects=%5B"${deployment.project.id}"%5D`
              : `${instance.baseUrl}/automation/#/consume/deployment?projects=%5B"${deployment.project.id}"%5D`)
          : `${instance.baseUrl}/automation/#/service/catalog/consume/deployment?projects=%5B"${deployment.project.id}"%5D`;
        
        entities.push({
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Domain',
          metadata: {
            name: deployment.project.id.toLowerCase(),
            title: deployment.project.name,
            annotations: {
              [ANNOTATION_LOCATION]: locationRef,
              [ANNOTATION_ORIGIN_LOCATION]: locationRef,
              'backstage.io/view-url': domainViewUrl,
              'terasky.backstage.io/vcf-automation-instance': instance.name,
              'terasky.backstage.io/vcf-automation-version': instance.majorVersion.toString(),
            },
            links: domainLinks,
            tags: [`vcf-automation:${instance.name}`],
          },
          spec: {
            owner: deployment.ownedBy,
            type: 'vcf-automation-project',
          },
        });
      }

      // Create System entity for the deployment
      const systemViewUrl = instance.majorVersion >= 9 
        ? (instance.organizationType === 'all-apps'
            ? `${instance.baseUrl}/automation/#/build-and-deploy/all-resources/deployments/${deployment.id}`
            : `${instance.baseUrl}/automation/#/consume/deployment/${deployment.id}`)
        : `${instance.baseUrl}/automation/#/service/catalog/consume/deployment/${deployment.id}`;
      
      const systemLinks = [{
        url: systemViewUrl,
        title: 'Open in VCF Automation',
      }];
      
      const systemEntity: SystemEntity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'System',
        metadata: {
          name: deployment.id.toLowerCase(),
          title: deployment.name,
          annotations: {
            [ANNOTATION_LOCATION]: locationRef,
            [ANNOTATION_ORIGIN_LOCATION]: locationRef,
            'terasky.backstage.io/vcf-automation-deployment-status': deployment.status,
            'terasky.backstage.io/vcf-automation-deployment-cost': JSON.stringify(deployment.expense),
            'terasky.backstage.io/vcf-automation-deployment-created-at': deployment.createdAt,
            'terasky.backstage.io/vcf-automation-deployment-created-by': deployment.createdBy,
            'terasky.backstage.io/vcf-automation-deployment-last-updated': deployment.lastUpdatedAt,
            'terasky.backstage.io/vcf-automation-deployment-last-updated-by': deployment.lastUpdatedBy,
            'terasky.backstage.io/vcf-automation-deployment-last-request': JSON.stringify(deployment.lastRequest),
            'terasky.backstage.io/vcf-automation-instance': instance.name,
            'terasky.backstage.io/vcf-automation-version': instance.majorVersion.toString(),
            'backstage.io/view-url': systemViewUrl,
          },
          links: systemLinks,
          tags: [`vcf-automation:${instance.name}`],
        },
        spec: {
          type: 'vcf-automation-deployment',
          owner: `${deployment.ownerType.toLowerCase()}:${deployment.ownedBy.toLowerCase()}`,
          domain: deployment.project.id.toLowerCase(),
        },
      };
      entities.push(systemEntity);

      // Get the name-to-id map for this deployment
      const nameToIdMap = deploymentResourceNameMap.get(deployment.id);

      // For all-apps organization type, fetch detailed resource data
      let detailedResources = deployment.resources;
      if (instance.organizationType === 'all-apps') {
        try {
          this.logger.debug(`Fetching detailed resources for deployment ${deployment.id} (all-apps)`);
          const resourcesResponse = await fetch(
            `${instance.baseUrl}/deployment/api/deployments/${deployment.id}/resources`,
            {
              headers: {
                Authorization: `Bearer ${instance.token}`,
              },
            },
          );
          
          if (resourcesResponse.ok) {
            const resourcesData = await resourcesResponse.json();
            // Handle both direct array and paginated response with content wrapper
            if (Array.isArray(resourcesData)) {
              detailedResources = resourcesData;
            } else if (resourcesData.content && Array.isArray(resourcesData.content)) {
              detailedResources = resourcesData.content;
            }
            this.logger.debug(`Fetched ${detailedResources.length} detailed resources for deployment ${deployment.id}`);
          } else {
            this.logger.warn(`Failed to fetch detailed resources for deployment ${deployment.id}: ${resourcesResponse.status}`);
          }
        } catch (error) {
          this.logger.error(`Error fetching detailed resources for deployment ${deployment.id}:`, error instanceof Error ? error : new Error(String(error)));
        }
      }

      // Create Component and Resource entities for each resource
      for (const resource of detailedResources) {
        // Log dependency resolution for debugging
        if (resource.dependsOn && resource.dependsOn.length > 0) {
          this.logger.debug(
            `Resolving dependencies for resource ${resource.id} (${resource.name}): ${resource.dependsOn.join(', ')}`,
          );
        }

        let resourceViewUrl: string;
        if (instance.majorVersion >= 9) {
          if (instance.organizationType === 'all-apps') {
            resourceViewUrl = `${instance.baseUrl}/automation/#/build-and-deploy/all-resources/deployments/${deployment.id}`;
          } else {
            resourceViewUrl = `${instance.baseUrl}/automation/#/consume/deployment/${deployment.id}`;
          }
        } else {
          resourceViewUrl = `${instance.baseUrl}/automation/#/service/catalog/consume/deployment/${deployment.id}`;
        }
        
        const resourceLinks = [{
          url: resourceViewUrl,
          title: 'Open in VCF Automation',
        }];
        
        const baseEntity = {
          metadata: {
            name: resource.id.toLowerCase(),
            title: resource.name,
            annotations: {
              [ANNOTATION_LOCATION]: locationRef,
              [ANNOTATION_ORIGIN_LOCATION]: locationRef,
              'terasky.backstage.io/vcf-automation-resource-type': resource.type,
              'terasky.backstage.io/vcf-automation-resource-properties': JSON.stringify((detailedResources.find(dr => dr.id === resource.id) || resource).properties || {}),
              'terasky.backstage.io/vcf-automation-resource-created-at': resource.createdAt,
              'terasky.backstage.io/vcf-automation-resource-origin': resource.origin,
              'terasky.backstage.io/vcf-automation-resource-sync-status': resource.syncStatus,
              'terasky.backstage.io/vcf-automation-resource-state': resource.state,
              'terasky.backstage.io/vcf-automation-instance': instance.name,
              'terasky.backstage.io/vcf-automation-version': instance.majorVersion.toString(),
              'backstage.io/view-url': resourceViewUrl,
            },
            links: resourceLinks,
            tags: [`vcf-automation:${instance.name}`,"vcf-automation-resource"],
          },
          spec: {
            owner: `${deployment.ownerType.toLowerCase()}:${deployment.ownedBy.toLowerCase()}`,
            type: resource.type,
            system: deployment.id.toLowerCase(),
            dependsOn: resource.dependsOn?.map(depName => {
              // Look up the resource ID using the name from the same deployment
              const depId = nameToIdMap?.get(depName);
              if (!depId) {
                this.logger.warn(`Failed to resolve dependency name ${depName} to ID for resource ${resource.id} (${resource.name})`);
                return undefined;
              }
              
              // Find the dependency resource to determine its type
              const depResource = detailedResources?.find(r => r.name === depName);
              if (depResource && (depResource.type === 'CCI.Supervisor.Namespace' || depResource.type === 'CCI.Supervisor.Resource')) {
                // CCI resources are created as Components
                return `component:default/${depId.toLowerCase()}`;
              } else {
                // Other resources use the default entity reference
                return getEntityRef(depId);
              }
            }).filter((ref): ref is string => ref !== undefined) || [],
          },
        };

        if (resource.type === 'Cloud.vSphere.Machine') {
          // Add the remote console link for vSphere VMs
          const componentLinks = [
            ...resourceLinks,
            {
              url: `${instance.baseUrl}/provisioning-ui/#/machines/remote-console/${resource.id}`,
              title: 'Open Remote Console',
            },
          ];
          
          entities.push({
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'Component',
            ...baseEntity,
            metadata: {
              ...baseEntity.metadata,
              links: componentLinks,
            },
            spec: {
              ...baseEntity.spec,
              lifecycle: 'production',
            },
          });
        } else if (resource.type === 'CCI.Supervisor.Namespace') {
          // CCI Supervisor Namespace becomes a Component
          entities.push({
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'Component',
            ...baseEntity,
            metadata: {
              ...baseEntity.metadata,
              annotations: {
                ...baseEntity.metadata.annotations,
                'terasky.backstage.io/vcf-automation-cci-namespace-endpoint': resource.properties?.status?.namespaceEndpointURL || '',
                'terasky.backstage.io/vcf-automation-cci-namespace-phase': resource.properties?.status?.phase || '',
              },
            },
            spec: {
              ...baseEntity.spec,
              lifecycle: 'production',
            },
          });
        } else if (resource.type === 'CCI.Supervisor.Resource') {
          // CCI Supervisor Resource becomes a Component and subcomponent of its namespace dependency
          const namespaceDependency = resource.dependsOn?.find(dep => 
            detailedResources?.find(r => r.name === dep && r.type === 'CCI.Supervisor.Namespace')
          );
          
          let subcomponentOf: string = '';
          if (namespaceDependency) {
            const namespaceResource = detailedResources?.find(r => r.name === namespaceDependency);
            if (namespaceResource) {
              // CCI Supervisor Namespace resources are created as Components, so use component: reference
              subcomponentOf = `component:default/${namespaceResource.id.toLowerCase()}`;
            }
          }
          
          entities.push({
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'Component',
            ...baseEntity,
            metadata: {
              ...baseEntity.metadata,
              annotations: {
                ...baseEntity.metadata.annotations,
                'terasky.backstage.io/vcf-automation-cci-resource-context': resource.properties?.context || '',
                'terasky.backstage.io/vcf-automation-cci-resource-manifest': JSON.stringify(resource.properties?.manifest || {}),
                'terasky.backstage.io/vcf-automation-cci-resource-object': JSON.stringify(resource.properties?.object || {}),
              },
            },
            spec: {
              ...baseEntity.spec,
              lifecycle: 'production',
              subcomponentOf,
            },
          });
        } else {
          entities.push({
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'Resource',
            ...baseEntity,
          });
        }
      }
    }

    return entities.map(entity => ({
      entity,
      locationKey: locationRef,
    }));
  }
}
