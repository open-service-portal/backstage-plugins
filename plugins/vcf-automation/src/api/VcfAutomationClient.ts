import { createApiRef, DiscoveryApi, IdentityApi } from '@backstage/core-plugin-api';
import { VcfProject as VcfProjectType } from '../types';

export interface VcfDeploymentEvent {
  timestamp: string;
  status: string;
  operation: string;
  user: string;
  details: string;
}

export interface VcfDeploymentConfig {
  key: string;
  value: string;
}

export interface VcfDeploymentResponse {
  content: any;
  pageable: any;
  config: VcfDeploymentConfig[];
  history: VcfDeploymentEvent[];
}

export interface VcfVSphereVM {
  id: string;
  name: string;
  type: string;
  properties: {
    resourceId: string;
    moref: string;
    resourceDescLink: string;
    powerState: string;
    zone: string;
    environmentName: string;
    hasSnapshots: string;
    computeHostType: string;
    id: string;
    memoryGB: string;
    cpuCount: number;
    image: string;
    totalMemoryMB: number;
    endpointType: string;
    resourceName: string;
    tags: string[];
    softwareName: string;
    name: string;
    resourceLink: string;
    region: string;
    hostName: string;
    storage: {
      disks: Array<{
        vm: string;
        name: string;
        type: string;
        shares?: string;
        vcUuid: string;
        diskFile?: string;
        bootOrder?: number;
        encrypted: boolean;
        limitIops?: string;
        capacityGb: number;
        persistent: boolean;
        independent?: string;
        sharesLevel?: string;
        endpointType: string;
        resourceLink: string;
        vmFolderPath?: string;
        controllerKey: string;
        diskPlacementRef?: string;
        existingResource: string;
        provisioningType?: string;
        controllerUnitNumber: string;
      }>;
    };
    networks: Array<{
      id: string;
      name: string;
      address: string;
      network: string;
      assignment: string;
      deviceIndex: number;
      external_id: string;
      mac_address: string;
      resourceName: string;
      ipv6Addresses?: string[];
    }>;
    areVMActionsDisabled: string;
    providerId: string;
    osType: string;
    instanceUUID: string;
    componentType: string;
    address: string;
    endpointId: string;
    externalId: string;
    datacenter: string;
    datastoreName: string;
    coreCount: string;
    primaryMAC: string;
    computeHostRef: string;
    snapshotCount: string;
    accounts: string[];
    vmFolderPath: string;
    account: string;
    vcUuid: string;
  };
  createdAt: string;
  syncStatus: string;
  expense: {
    totalExpense: number;
    computeExpense: number;
    storageExpense: number;
    additionalExpense: number;
    unit: string;
    lastUpdatedTime: string;
  };
  origin: string;
  dependsOn: string[];
  state: string;
}

export type VcfProject = VcfProjectType;

export interface VcfAutomationApi {
  getDeploymentEvents(deploymentId: string, instanceName?: string): Promise<VcfDeploymentResponse>;
  getVSphereVMDetails(deploymentId: string, resourceId: string, instanceName?: string): Promise<VcfVSphereVM>;
  getProjectDetails(projectId: string, instanceName?: string): Promise<VcfProject>;
  getGenericResourceDetails(deploymentId: string, resourceId: string, instanceName?: string): Promise<any>;
  getDeploymentDetails(deploymentId: string, instanceName?: string): Promise<any>;
  getProjects(instanceName?: string): Promise<any>;
  getDeployments(instanceName?: string): Promise<any>;
  getDeploymentResources(deploymentId: string, instanceName?: string): Promise<any>;
  getSupervisorResources(instanceName?: string): Promise<any>;
  getSupervisorResource(resourceId: string, instanceName?: string): Promise<any>;
}

export const vcfAutomationApiRef = createApiRef<VcfAutomationApi>({
  id: 'plugin.vcf-automation.service',
});

export class VcfAutomationClient implements VcfAutomationApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly identityApi: IdentityApi;

  constructor(options: { discoveryApi: DiscoveryApi; identityApi: IdentityApi }) {
    this.discoveryApi = options.discoveryApi;
    this.identityApi = options.identityApi;
  }

  private async getAuthHeaders(): Promise<HeadersInit> {
    const token = await this.identityApi.getCredentials();
    return {
      'Content-Type': 'application/json',
      ...(token?.token ? { Authorization: `Bearer ${token.token}` } : {}),
    };
  }

  async getDeploymentEvents(deploymentId: string, instanceName?: string): Promise<VcfDeploymentResponse> {
    const baseUrl = await this.discoveryApi.getBaseUrl('vcf-automation');
    const headers = await this.getAuthHeaders();
    const url = instanceName 
      ? `${baseUrl}/deployments/${deploymentId}/events?instance=${encodeURIComponent(instanceName)}`
      : `${baseUrl}/deployments/${deploymentId}/events`;
    const response = await fetch(url, {
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch deployment events: ${response.statusText}`);
    }
    return await response.json();
  }

  async getVSphereVMDetails(deploymentId: string, resourceId: string, instanceName?: string): Promise<VcfVSphereVM> {
    const baseUrl = await this.discoveryApi.getBaseUrl('vcf-automation');
    const headers = await this.getAuthHeaders();
    const url = instanceName 
      ? `${baseUrl}/deployments/${deploymentId}/resources/${resourceId}?instance=${encodeURIComponent(instanceName)}`
      : `${baseUrl}/deployments/${deploymentId}/resources/${resourceId}`;
    const response = await fetch(url, {
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch resource details: ${response.statusText}`);
    }
    return await response.json();
  }

  async getGenericResourceDetails(deploymentId: string, resourceId: string, instanceName?: string): Promise<any> {
    const baseUrl = await this.discoveryApi.getBaseUrl('vcf-automation');
    const headers = await this.getAuthHeaders();
    
    const url = instanceName 
      ? `${baseUrl}/deployments/${deploymentId}/resources/${resourceId}?instance=${encodeURIComponent(instanceName)}`
      : `${baseUrl}/deployments/${deploymentId}/resources/${resourceId}`;
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch resource details: ${response.statusText}`);
    }

    return await response.json();
  }

  async getDeploymentDetails(deploymentId: string, instanceName?: string): Promise<any> {
    const baseUrl = await this.discoveryApi.getBaseUrl('vcf-automation');
    const headers = await this.getAuthHeaders();
    
    const url = instanceName 
      ? `${baseUrl}/deployments/${deploymentId}?instance=${encodeURIComponent(instanceName)}`
      : `${baseUrl}/deployments/${deploymentId}`;
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch deployment details: ${response.statusText}`);
    }

    return await response.json();
  }

  async getProjectDetails(projectId: string, instanceName?: string): Promise<VcfProject> {
    const baseUrl = await this.discoveryApi.getBaseUrl('vcf-automation');
    const headers = await this.getAuthHeaders();
    const url = instanceName 
      ? `${baseUrl}/projects/${projectId}?instance=${encodeURIComponent(instanceName)}`
      : `${baseUrl}/projects/${projectId}`;
    const response = await fetch(url, {
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch project details: ${response.statusText}`);
    }
    return await response.json();
  }

  async getProjects(instanceName?: string): Promise<any> {
    const baseUrl = await this.discoveryApi.getBaseUrl('vcf-automation');
    const headers = await this.getAuthHeaders();
    const url = instanceName 
      ? `${baseUrl}/projects?instance=${encodeURIComponent(instanceName)}`
      : `${baseUrl}/projects`;
    const response = await fetch(url, {
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.statusText}`);
    }
    return await response.json();
  }

  async getDeployments(instanceName?: string): Promise<any> {
    const baseUrl = await this.discoveryApi.getBaseUrl('vcf-automation');
    const headers = await this.getAuthHeaders();
    const url = instanceName 
      ? `${baseUrl}/deployments?instance=${encodeURIComponent(instanceName)}`
      : `${baseUrl}/deployments`;
    const response = await fetch(url, {
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch deployments: ${response.statusText}`);
    }
    return await response.json();
  }

  async getDeploymentResources(deploymentId: string, instanceName?: string): Promise<any> {
    const baseUrl = await this.discoveryApi.getBaseUrl('vcf-automation');
    const headers = await this.getAuthHeaders();
        const url = instanceName
      ? `${baseUrl}/deployments/${deploymentId}/resources?instance=${encodeURIComponent(instanceName)}`
      : `${baseUrl}/deployments/${deploymentId}/resources`;
    const response = await fetch(url, {
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch deployment resources: ${response.statusText}`);
    }
    return await response.json();
  }

  async getSupervisorResources(instanceName?: string): Promise<any> {
    const baseUrl = await this.discoveryApi.getBaseUrl('vcf-automation');
    const headers = await this.getAuthHeaders();
    
    const url = instanceName
      ? `${baseUrl}/supervisor-resources?instance=${encodeURIComponent(instanceName)}`
      : `${baseUrl}/supervisor-resources`;
    const response = await fetch(url, {
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch supervisor resources: ${response.statusText}`);
    }
    return await response.json();
  }

  async getSupervisorResource(resourceId: string, instanceName?: string): Promise<any> {
    const baseUrl = await this.discoveryApi.getBaseUrl('vcf-automation');
    const headers = await this.getAuthHeaders();
    
    const url = instanceName
      ? `${baseUrl}/supervisor-resources/${resourceId}?instance=${encodeURIComponent(instanceName)}`
      : `${baseUrl}/supervisor-resources/${resourceId}`;
    const response = await fetch(url, {
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch supervisor resource: ${response.statusText}`);
    }
    return await response.json();
  }
} 