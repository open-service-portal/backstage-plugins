import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { createApiRef } from '@backstage/core-plugin-api';

export class VcfOperationsApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public details?: any,
  ) {
    super(message);
    this.name = 'VcfOperationsApiError';
  }
}

export interface MetricQueryRequest {
  resourceIds: string[];
  statKeys: string[];
  begin?: number;
  end?: number;
  rollUpType?: string;
  intervalType?: string;
  intervalQuantifier?: number;
}

export interface MetricData {
  resourceId: string;
  stat: {
    statKey: {
      key: string;
    };
    timestamps: number[];
    data: number[];
  };
}

export interface StatsResponse {
  values: MetricData[];
}

export interface VcfOperationsInstance {
  name: string;
  relatedVCFAInstances?: string[];
}

export interface Resource {
  identifier: string;
  resourceKey: {
    name: string;
    adapterKindKey: string;
    resourceKindKey: string;
    resourceIdentifiers: Array<{
      identifierType: {
        name: string;
      };
      value: string;
    }>;
  };
}

export interface ResourceQueryRequest {
  propertyConditions?: {
    conjunctionOperator: 'AND' | 'OR';
    conditions: Array<{
      key: string;
      operator: 'EQ' | 'NE' | 'CONTAINS' | 'STARTS_WITH' | 'ENDS_WITH';
      stringValue?: string;
      numericValue?: number;
    }>;
  };
  nameConditions?: {
    conjunctionOperator: 'AND' | 'OR';
    conditions: Array<{
      key: 'resourceName';
      operator: 'EQ' | 'NE' | 'CONTAINS' | 'STARTS_WITH' | 'ENDS_WITH';
      stringValue: string;
    }>;
  };
}

export interface VcfOperationsApi {
  getInstances(): Promise<VcfOperationsInstance[]>;
  getResourceMetrics(
    resourceId: string,
    statKeys: string[],
    begin?: number,
    end?: number,
    rollUpType?: string,
    instance?: string,
  ): Promise<StatsResponse>;
  queryResourceMetrics(
    queryRequest: MetricQueryRequest,
    instance?: string,
  ): Promise<StatsResponse>;
  getLatestResourceMetrics(
    resourceIds: string[],
    statKeys: string[],
    instance?: string,
  ): Promise<StatsResponse>;
  getResourceDetails(resourceId: string, instance?: string): Promise<any>;
  searchResources(
    name?: string,
    adapterKind?: string,
    resourceKind?: string,
    instance?: string,
  ): Promise<any>;
  queryResources(
    queryRequest: ResourceQueryRequest,
    instance?: string,
  ): Promise<{ resourceList: Resource[] }>;
  findResourceByProperty(
    propertyKey: string,
    propertyValue: string,
    instance?: string,
  ): Promise<Resource | null>;
  findResourceByName(
    resourceName: string,
    instance?: string,
    resourceType?: string,
  ): Promise<Resource | null>;
}

export const vcfOperationsApiRef = createApiRef<VcfOperationsApi>({
  id: 'plugin.vcf-operations.service',
});

export class VcfOperationsClient implements VcfOperationsApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
  }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  private async getBaseUrl(): Promise<string> {
    return await this.discoveryApi.getBaseUrl('vcf-operations');
  }

  async getInstances(): Promise<VcfOperationsInstance[]> {
    const baseUrl = await this.getBaseUrl();
    const response = await this.fetchApi.fetch(`${baseUrl}/instances`);
    
    if (!response.ok) {
      let errorMessage = `Failed to get instances: ${response.statusText}`;
      let details: any;
      
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
          details = errorData.details;
        }
      } catch {
        // If response body is not JSON, use status text
      }
      
      throw new VcfOperationsApiError(
        errorMessage,
        response.status,
        response.statusText,
        details,
      );
    }
    
    return response.json();
  }

  async getResourceMetrics(
    resourceId: string,
    statKeys: string[],
    begin?: number,
    end?: number,
    rollUpType?: string,
    instance?: string,
  ): Promise<StatsResponse> {
    const baseUrl = await this.getBaseUrl();
    const params = new URLSearchParams();
    
    statKeys.forEach(statKey => params.append('statKeys', statKey));
    if (begin) params.append('begin', begin.toString());
    if (end) params.append('end', end.toString());
    if (rollUpType) params.append('rollUpType', rollUpType);
    if (instance) params.append('instance', instance);
    
    const url = `${baseUrl}/resources/${resourceId}/metrics?${params.toString()}`;
    const response = await this.fetchApi.fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to get resource metrics: ${response.statusText}`);
    }
    
    return response.json();
  }

  async queryResourceMetrics(
    queryRequest: MetricQueryRequest,
    instance?: string,
  ): Promise<StatsResponse> {
    const baseUrl = await this.getBaseUrl();
    const params = new URLSearchParams();
    if (instance) params.append('instance', instance);
    
    const url = `${baseUrl}/metrics/query?${params.toString()}`;
    const response = await this.fetchApi.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(queryRequest),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to query metrics: ${response.statusText}`);
    }
    
    return response.json();
  }

  async getLatestResourceMetrics(
    resourceIds: string[],
    statKeys: string[],
    instance?: string,
  ): Promise<StatsResponse> {
    const baseUrl = await this.getBaseUrl();
    const params = new URLSearchParams();
    
    resourceIds.forEach(resourceId => params.append('resourceIds', resourceId));
    statKeys.forEach(statKey => params.append('statKeys', statKey));
    if (instance) params.append('instance', instance);
    
    const url = `${baseUrl}/metrics/latest?${params.toString()}`;
    const response = await this.fetchApi.fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to get latest metrics: ${response.statusText}`);
    }
    
    return response.json();
  }

  async getResourceDetails(resourceId: string, instance?: string): Promise<any> {
    const baseUrl = await this.getBaseUrl();
    const params = new URLSearchParams();
    if (instance) params.append('instance', instance);
    
    const url = `${baseUrl}/resources/${resourceId}?${params.toString()}`;
    const response = await this.fetchApi.fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to get resource details: ${response.statusText}`);
    }
    
    return response.json();
  }

  async searchResources(
    name?: string,
    adapterKind?: string,
    resourceKind?: string,
    instance?: string,
  ): Promise<any> {
    const baseUrl = await this.getBaseUrl();
    const params = new URLSearchParams();
    
    if (name) params.append('name', name);
    if (adapterKind) params.append('adapterKind', adapterKind);
    if (resourceKind) params.append('resourceKind', resourceKind);
    if (instance) params.append('instance', instance);
    
    const url = `${baseUrl}/resources?${params.toString()}`;
    const response = await this.fetchApi.fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to search resources: ${response.statusText}`);
    }
    
    return response.json();
  }

  async queryResources(
    queryRequest: ResourceQueryRequest,
    instance?: string,
  ): Promise<{ resourceList: Resource[] }> {
    const baseUrl = await this.getBaseUrl();
    const params = new URLSearchParams();
    if (instance) params.append('instance', instance);
    
    const url = `${baseUrl}/resources/query?${params.toString()}`;
    const response = await this.fetchApi.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(queryRequest),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to query resources: ${response.statusText}`);
    }
    
    return response.json();
  }

  async findResourceByProperty(
    propertyKey: string,
    propertyValue: string,
    instance?: string,
  ): Promise<Resource | null> {
    const baseUrl = await this.getBaseUrl();
    const params = new URLSearchParams();
    
    params.append('propertyKey', propertyKey);
    params.append('propertyValue', propertyValue);
    if (instance) params.append('instance', instance);
    
    const url = `${baseUrl}/resources/find-by-property?${params.toString()}`;
    const response = await this.fetchApi.fetch(url);
    
    if (!response.ok) {
      let errorMessage = `Failed to find resource by property: ${response.statusText}`;
      let details: any;
      
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
          details = errorData.details;
        }
      } catch {
        // If response body is not JSON, use status text
      }
      
      throw new VcfOperationsApiError(
        errorMessage,
        response.status,
        response.statusText,
        details,
      );
    }
    
    return response.json();
  }

  async findResourceByName(
    resourceName: string,
    instance?: string,
    resourceType?: string,
  ): Promise<Resource | null> {
    const baseUrl = await this.getBaseUrl();
    const params = new URLSearchParams();
    
    params.append('resourceName', resourceName);
    if (instance) params.append('instance', instance);
    if (resourceType) params.append('resourceType', resourceType);
    
    const url = `${baseUrl}/resources/find-by-name?${params.toString()}`;
    const response = await this.fetchApi.fetch(url);
    
    if (!response.ok) {
      let errorMessage = `Failed to find resource by name: ${response.statusText}`;
      let details: any;
      
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
          details = errorData.details;
        }
      } catch {
        // If response body is not JSON, use status text
      }
      
      throw new VcfOperationsApiError(
        errorMessage,
        response.status,
        response.statusText,
        details,
      );
    }
    
    return response.json();
  }
}