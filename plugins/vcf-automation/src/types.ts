export interface VcfPageable {
  pageNumber: number;
  pageSize: number;
  sort: {
    empty: boolean;
    sorted: boolean;
    unsorted: boolean;
  };
  offset: number;
  paged: boolean;
  unpaged: boolean;
}

export interface VcfPageResponse<T> {
  content: T[];
  pageable: VcfPageable;
  totalElements: number;
  totalPages: number;
  last: boolean;
  size: number;
  number: number;
  sort: {
    empty: boolean;
    sorted: boolean;
    unsorted: boolean;
  };
  numberOfElements: number;
  first: boolean;
  empty: boolean;
}

export interface VcfDeploymentHistory {
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

export interface VcfDeploymentEvent {
  id: string;
  requestId: string;
  requestedBy: string;
  resourceIds: string[];
  name: string;
  details: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface VcfResourceDisk {
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
}

export interface VcfResourceNetwork {
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
}

export interface VcfResourceExpense {
  totalExpense: number;
  computeExpense: number;
  storageExpense: number;
  additionalExpense: number;
  unit: string;
  lastUpdatedTime: string;
}

export interface VcfResource {
  id: string;
  name: string;
  type: string;
  properties: {
    [key: string]: any;
    storage?: {
      disks: VcfResourceDisk[];
    };
    networks?: VcfResourceNetwork[];
  };
  createdAt: string;
  syncStatus: string;
  expense: VcfResourceExpense;
  origin: string;
  dependsOn: string[];
  state: string;
}

export interface VcfProjectZone {
  zoneId: string;
  priority: number;
  maxNumberInstances: number;
  allocatedInstancesCount: number;
  memoryLimitMB: number;
  allocatedMemoryMB: number;
  cpuLimit: number;
  allocatedCpu: number;
  storageLimitGB: number;
  allocatedStorageGB: number;
  id: string;
}

export interface VcfProject {
  // Common properties (present in both vm-apps and all-apps)
  name: string;
  description: string;
  id: string;
  operationTimeout: number;
  administrators: Array<{ email: string; type: string; }> | any[]; // Can be empty array in all-apps
  
  // vm-apps specific properties (optional)
  machineNamingTemplate?: string;
  members?: Array<{ email: string; type: string; }>;
  viewers?: Array<{ email: string; type: string; }>;
  supervisors?: Array<{ email: string; type: string; }>;
  zones?: VcfProjectZone[];
  constraints?: Record<string, unknown>;
  sharedResources?: boolean;
  placementPolicy?: string;
  customProperties?: Record<string, unknown>;
  organizationId?: string;
  _links?: {
    self: {
      href: string;
    };
  };
  
  // all-apps specific properties (optional)
  orgId?: string;
  users?: any[];
  auditors?: any[];
  advancedUsers?: any[];
  properties?: Record<string, unknown>;
}

export interface CciSupervisorNamespace {
  id: string;
  name: string;
  type: 'CCI.Supervisor.Namespace';
  properties: {
    metadata: {
      'infrastructure.cci.vmware.com/id': string;
      'infrastructure.cci.vmware.com/project-id': string;
    };
    existing: boolean;
    name: string;
    id: string;
    resourceLink: string;
    status: {
      conditions: Array<{
        lastTransitionTime: string;
        status: string;
        type: string;
      }>;
      namespaceEndpointURL: string;
      phase: string;
      storageClasses: Array<{
        limit: string;
        name: string;
      }>;
      vmClasses: Array<{
        name: string;
      }>;
      zones: Array<{
        cpuLimit: string;
        cpuReservation: string;
        memoryLimit: string;
        memoryReservation: string;
        name: string;
      }>;
    };
  };
  createdAt: string;
  syncStatus: string;
  origin: string;
  state: string;
}

export interface CciSupervisorResource {
  id: string;
  name: string;
  type: 'CCI.Supervisor.Resource';
  properties: {
    wait?: {
      conditions: Array<{
        type: string;
        status: string;
      }>;
    };
    manifest: any; // Kubernetes manifest - can be any structure
    count?: number;
    existing: boolean;
    countIndex?: number;
    context: string;
    id: string;
    resourceLink: string;
    object: any; // The actual Kubernetes object
  };
  createdAt: string;
  syncStatus: string;
  origin: string;
  dependsOn: string[];
  state: string;
}

export interface StandaloneSupervisorResource {
  id: string;
  orgId: string;
  project: {
    id: string;
    name: string;
  };
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
    creationTimestamp: string;
    uid: string;
    resourceVersion: string;
  };
  spec: any;
  status: any;
}

// VM Power Management Types
export interface VmPowerAction {
  id: string;
  name: string;
  displayName: string;
  description: string;
  dependents: string[];
  valid: boolean;
  actionType: string;
}

export interface VmPowerActionRequest {
  actionId: string;
}

export interface StandaloneVmStatus {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    annotations?: { [key: string]: string };
    labels?: { [key: string]: string };
    creationTimestamp: string;
    uid: string;
    resourceVersion: string;
  };
  spec: {
    powerState: 'PoweredOn' | 'PoweredOff';
    className: string;
    imageName: string;
    network?: any;
    bootstrap?: any;
    [key: string]: any;
  };
  status: {
    powerState: 'PoweredOn' | 'PoweredOff';
    conditions: Array<{
      type: string;
      status: string;
      lastTransitionTime: string;
      reason?: string;
      message?: string;
    }>;
    [key: string]: any;
  };
}

export type VmPowerState = 'PoweredOn' | 'PoweredOff';
export type VmPowerActionType = 'PowerOn' | 'PowerOff'; 