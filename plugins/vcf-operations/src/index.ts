export { 
  vcfOperationsPlugin, 
  VCFOperationsExplorerPage, 
  VCFOperationsExplorerComponent 
} from './plugin';
export { VCFOperationsExplorer } from './components/VCFOperationsExplorer';
export { NotImplementedMessage } from './components/NotImplementedMessage';

// API exports
export { vcfOperationsApiRef, VcfOperationsClient } from './api/VcfOperationsClient';
export type { 
  VcfOperationsApi, 
  MetricData, 
  StatsResponse, 
  MetricQueryRequest,
  Resource,
  ResourceQueryRequest,
} from './api/VcfOperationsClient';

// Route exports
export { rootRouteRef } from './routes';