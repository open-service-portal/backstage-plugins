import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';
import fetch from 'node-fetch';

interface VcfAuthResponse {
  cspAuthToken: string;
}

interface VcfErrorResponse {
  error: string;
  status: 'error';
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

export class VcfAutomationService {
  private readonly instances: VcfInstance[];
  private readonly defaultInstance: VcfInstance;

  constructor(config: Config, private readonly logger: LoggerService) {
    // Get instances configuration
    let instances: VcfInstance[] = [];
    
    try {
      // First try to get instances array
      const instancesConfig = config.getOptionalConfigArray('vcfAutomation.instances');
      
      if (instancesConfig && instancesConfig.length > 0) {
        // Multi-instance configuration
        instances = instancesConfig.map(instanceConfig => {
          const baseUrl = instanceConfig.getString('baseUrl');
          return {
            baseUrl,
            name: instanceConfig.getOptionalString('name') ?? new URL(baseUrl).hostname,
            majorVersion: instanceConfig.getOptionalNumber('majorVersion') ?? 8,
            authentication: {
              username: instanceConfig.getString('authentication.username'),
              password: instanceConfig.getString('authentication.password'),
              domain: instanceConfig.getOptionalString('authentication.domain') ?? "",
            },
            orgName: instanceConfig.getOptionalString('orgName'),
            organizationType: instanceConfig.getOptionalString('organizationType') as 'vm-apps' | 'all-apps' ?? 'vm-apps',
          };
        });
      } else {
        // Legacy single instance configuration
        const baseUrl = config.getString('vcfAutomation.baseUrl');
        const auth = config.getConfig('vcfAutomation.authentication');
        instances = [{
          baseUrl,
          name: config.getOptionalString('vcfAutomation.name') ?? new URL(baseUrl).hostname,
          majorVersion: config.getOptionalNumber('vcfAutomation.majorVersion') ?? 8,
          authentication: {
            username: auth.getString('username'),
            password: auth.getString('password'),
            domain: auth.getString('domain'),
          },
          orgName: config.getOptionalString('vcfAutomation.orgName'),
          organizationType: config.getOptionalString('vcfAutomation.organizationType') as 'vm-apps' | 'all-apps' ?? 'vm-apps',
        }];
      }
    } catch (error) {
      this.logger.error('Failed to read VCF Automation configuration', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('Failed to initialize VCF Automation service: Invalid configuration');
    }

    if (instances.length === 0) {
      throw new Error('No VCF Automation instances configured');
    }

    this.instances = instances;
    this.defaultInstance = instances[0];
    this.logger.info(`VcfAutomationService initialized with ${instances.length} instance(s)`);
  }

  private async authenticate(instance: VcfInstance, retries = 3): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (instance.token && instance.tokenExpiry && instance.tokenExpiry > new Date()) {
          this.logger.debug(`Using existing valid token for instance ${instance.name}`);
          return;
        }

        this.logger.debug(`Authentication attempt ${attempt} of ${retries} for instance ${instance.name} (version ${instance.majorVersion})`);
        
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
            throw new Error(`Authentication failed with status ${response.status}: ${response.statusText}`);
          }

          const accessToken = response.headers.get('x-vmware-vcloud-access-token');
          if (!accessToken) {
            throw new Error(`No access token received from VCF Automation instance ${instance.name}`);
          }

          instance.token = accessToken;
          // Version 9+ tokens expire after 1 hour
          instance.tokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
          this.logger.debug(`Successfully authenticated with VCF Automation instance ${instance.name} (version 9+)`);
          return;
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
            throw new Error(`Authentication failed with status ${response.status}: ${response.statusText}`);
          }

          const data = (await response.json()) as VcfAuthResponse;
          instance.token = data.cspAuthToken;
          // Version 8 tokens expire after 24 hours
          instance.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
          this.logger.debug(`Successfully authenticated with VCF Automation instance ${instance.name} (version 8)`);
          return;
        }
      } catch (error) {
        this.logger.warn(`Authentication attempt ${attempt} failed for instance ${instance.name}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        
        if (attempt === retries) {
          this.logger.error(`All authentication attempts failed for instance ${instance.name}`);
          throw new Error(`Failed to authenticate with VCF Automation instance ${instance.name} after multiple attempts`);
        }
        
        // Wait before retrying (with exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  private async makeAuthorizedRequest(path: string, instanceName?: string): Promise<any> {
    const instance = instanceName 
      ? this.instances.find(i => i.name === instanceName) ?? this.defaultInstance
      : this.defaultInstance;

    try {
      await this.authenticate(instance);
      const response = await fetch(`${instance.baseUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${instance.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      this.logger.error(`Failed to make authorized request to ${path} on instance ${instance.name}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`VCF Automation service unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getDeploymentHistory(deploymentId: string, instanceName?: string): Promise<any | VcfErrorResponse> {
    try {
      return await this.makeAuthorizedRequest(`/deployment/api/deployments/${deploymentId}/requests`, instanceName);
    } catch (error) {
      this.logger.error(`Failed to get deployment history for ${deploymentId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return { error: 'Service temporarily unavailable', status: 'error' };
    }
  }
  
  async getDeploymentDetails(deploymentId: string, instanceName?: string): Promise<any | VcfErrorResponse> {
    try {
      return await this.makeAuthorizedRequest(`/deployment/api/deployments/${deploymentId}`, instanceName);
    } catch (error) {
      this.logger.error(`Failed to get deployment details for ${deploymentId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return { error: 'Service temporarily unavailable', status: 'error' };
    }
  }

  async getDeploymentEvents(deploymentId: string, instanceName?: string): Promise<any | VcfErrorResponse> {
    try {
      return await this.makeAuthorizedRequest(`/deployment/api/deployments/${deploymentId}/userEvents`, instanceName);
    } catch (error) {
      this.logger.error(`Failed to get deployment events for ${deploymentId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return { error: 'Service temporarily unavailable', status: 'error' };
    }
  }

  async getResourceDetails(deploymentId: string, resourceId: string, instanceName?: string): Promise<any | VcfErrorResponse> {
    try {
      return await this.makeAuthorizedRequest(`/deployment/api/deployments/${deploymentId}/resources/${resourceId}`, instanceName);
    } catch (error) {
      this.logger.error(`Failed to get resource details for deployment ${deploymentId}, resource ${resourceId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return { error: 'Service temporarily unavailable', status: 'error' };
    }
  }

  async getProjectDetails(projectId: string, instanceName?: string): Promise<any | VcfErrorResponse> {
    const instance = instanceName 
      ? this.instances.find(i => i.name === instanceName) ?? this.defaultInstance
      : this.defaultInstance;

    try {
      // Use different API endpoints based on organization type
      const apiPath = instance.organizationType === 'all-apps' 
        ? `/project-service/api/projects/${projectId}`
        : `/iaas/api/projects/${projectId}`;
      
      return await this.makeAuthorizedRequest(apiPath, instanceName);
    } catch (error) {
      this.logger.error(`Failed to get project details for ${projectId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return { error: 'Service temporarily unavailable', status: 'error' };
    }
  }

  async getProjects(instanceName?: string): Promise<any | VcfErrorResponse> {
    const instance = instanceName 
      ? this.instances.find(i => i.name === instanceName) ?? this.defaultInstance
      : this.defaultInstance;

    try {
      // Use different API endpoints based on organization type
      const apiPath = instance.organizationType === 'all-apps' 
        ? `/project-service/api/projects`
        : `/iaas/api/projects`;
      
      return await this.makeAuthorizedRequest(apiPath, instanceName);
    } catch (error) {
      this.logger.error(`Failed to get projects list`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return { error: 'Service temporarily unavailable', status: 'error' };
    }
  }

  async getDeployments(instanceName?: string): Promise<any | VcfErrorResponse> {
    try {
      // Deployment API endpoint is the same for both organization types
      return await this.makeAuthorizedRequest(`/deployment/api/deployments`, instanceName);
    } catch (error) {
      this.logger.error(`Failed to get deployments list`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return { error: 'Service temporarily unavailable', status: 'error' };
    }
  }

  async getDeploymentResources(deploymentId: string, instanceName?: string): Promise<any | VcfErrorResponse> {
    try {
      // Resources API endpoint is the same for both organization types
      return await this.makeAuthorizedRequest(`/deployment/api/deployments/${deploymentId}/resources`, instanceName);
    } catch (error) {
      this.logger.error(`Failed to get resources for deployment ${deploymentId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return { error: 'Service temporarily unavailable', status: 'error' };
    }
  }
} 