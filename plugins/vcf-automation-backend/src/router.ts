import { Config } from '@backstage/config';
import express from 'express';
import { LoggerService, PermissionsService } from '@backstage/backend-plugin-api';
import { VcfAutomationService } from './services/VcfAutomationService';
export interface RouterOptions {
  logger: LoggerService;
  config: Config;
  permissions: PermissionsService;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config } = options;

  const router = express.Router();
  router.use(express.json());

  const vcfService = new VcfAutomationService(config, logger);

  router.get('/health', (_, response) => {
    response.json({ status: 'ok' });
  });

  router.get('/deployments/:deploymentId/history', async (req, res) => {
    const { deploymentId } = req.params;
    const instanceName = req.query.instance as string | undefined;
    const history = await vcfService.getDeploymentHistory(deploymentId, instanceName);
    res.json(history);
  });

  router.get('/deployments/:deploymentId/events', async (req, res) => {
    const { deploymentId } = req.params;
    const instanceName = req.query.instance as string | undefined;
    const events = await vcfService.getDeploymentEvents(deploymentId, instanceName);
    res.json(events);
  });

  router.get('/deployments/:deploymentId/resources/:resourceId', async (req, res) => {
    const { deploymentId, resourceId } = req.params;
    const instanceName = req.query.instance as string | undefined;
    const resource = await vcfService.getResourceDetails(deploymentId, resourceId, instanceName);
    res.json(resource);
  });

  router.get('/projects/:projectId', async (req, res) => {
    const { projectId } = req.params;
    const instanceName = req.query.instance as string | undefined;
    const project = await vcfService.getProjectDetails(projectId, instanceName);
    res.json(project);
  });

  router.get('/deployments/:deploymentId', async (req, res) => {
    const { deploymentId } = req.params;
    const instanceName = req.query.instance as string | undefined;
    const deployment = await vcfService.getDeploymentDetails(deploymentId, instanceName);
    res.json(deployment);
  });

  router.get('/projects', async (req, res) => {
    const instanceName = req.query.instance as string | undefined;
    const projects = await vcfService.getProjects(instanceName);
    res.json(projects);
  });

  router.get('/deployments', async (req, res) => {
    const instanceName = req.query.instance as string | undefined;
    const deployments = await vcfService.getDeployments(instanceName);
    res.json(deployments);
  });

  router.get('/deployments/:deploymentId/resources', async (req, res) => {
    const { deploymentId } = req.params;
    const instanceName = req.query.instance as string | undefined;
    const resources = await vcfService.getDeploymentResources(deploymentId, instanceName);
    res.json(resources);
  });

  router.get('/supervisor-resources', async (req, res) => {
    const instanceName = req.query.instance as string | undefined;
    const resources = await vcfService.getSupervisorResources(instanceName);
    res.json(resources);
  });

  router.get('/supervisor-resources/:resourceId', async (req, res) => {
    const { resourceId } = req.params;
    const instanceName = req.query.instance as string | undefined;
    const resource = await vcfService.getSupervisorResource(resourceId, instanceName);
    res.json(resource);
  });

  router.get('/supervisor-namespaces', async (req, res) => {
    const instanceName = req.query.instance as string | undefined;
    const namespaces = await vcfService.getSupervisorNamespaces(instanceName);
    res.json(namespaces);
  });

  router.get('/supervisor-namespaces/:namespaceId', async (req, res) => {
    const { namespaceId } = req.params;
    const instanceName = req.query.instance as string | undefined;
    const namespace = await vcfService.getSupervisorNamespace(namespaceId, instanceName);
    res.json(namespace);
  });

  return router;
}
