export { vcfAutomationPlugin } from './plugin';
export { VCFAutomationVSphereVMOverview } from './components/VCFAutomationVSphereVMOverview';
export { VCFAutomationProjectOverview } from './components/VCFAutomationProjectOverview';
export { VCFAutomationProjectDetails } from './components/VCFAutomationProjectDetails';
export { VCFAutomationDeploymentDetails } from './components/VCFAutomationDeploymentDetails';
export { VCFAutomationVSphereVMDetails } from './components/VCFAutomationVSphereVMDetails';
export { VCFAutomationGenericResourceDetails } from './components/VCFAutomationGenericResourceDetails';
export { VCFAutomationGenericResourceOverview } from './components/VCFAutomationGenericResourceOverview'; 
export { VCFAutomationDeploymentOverview } from './components/VCFAutomationDeploymentOverview';
export { VCFAutomationCCINamespaceOverview } from './components/VCFAutomationCCINamespaceOverview';
export { VCFAutomationCCIResourceOverview } from './components/VCFAutomationCCIResourceOverview';
export { VCFAutomationCCINamespaceDetails } from './components/VCFAutomationCCINamespaceDetails';
export { VCFAutomationCCIResourceDetails } from './components/VCFAutomationCCIResourceDetails';
export { VCFAutomationVMPowerManagement } from './components/VCFAutomationVMPowerManagement';

// API exports
export { vcfAutomationApiRef, VcfAutomationClient } from './api/VcfAutomationClient';
export type { VcfAutomationApi } from './api/VcfAutomationClient';

// Route exports
export {
  rootRouteRef,
} from './routes';

// Type exports
export type {
  VcfPageable,
  VcfPageResponse,
  VcfDeploymentHistory,
  VcfDeploymentEvent,
  VcfResourceDisk,
  VcfResourceNetwork,
  VcfResourceExpense,
  VcfResource,
  VcfProjectZone,
  VcfProject,
  CciSupervisorNamespace,
  CciSupervisorResource,
  VmPowerAction,
  VmPowerActionRequest,
  StandaloneVmStatus,
  VmPowerState,
  VmPowerActionType,
} from './types';
