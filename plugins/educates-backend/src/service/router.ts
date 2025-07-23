import express from 'express';
import Router from 'express-promise-router';
import { Config } from '@backstage/config';
import { LoggerService, PermissionsService, HttpAuthService } from '@backstage/backend-plugin-api';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { 
  portalViewPermission,
  workshopStartPermission 
} from '@terasky/backstage-plugin-educates-common';
import fetch from 'node-fetch';

export interface RouterOptions {
  logger: LoggerService;
  config: Config;
  permissions: PermissionsService;
  httpAuth: HttpAuthService;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config, permissions, httpAuth } = options;
  const router = Router();
  router.use(express.json());
  
  const trainingPortals = config.getConfigArray('educates.trainingPortals').map(portal => ({
    name: portal.getString('name'),
    url: portal.getString('url'),
    auth: {
      robotUsername: portal.getConfig('auth').getString('robotUsername'),
      robotPassword: portal.getConfig('auth').getString('robotPassword'),
      clientId: portal.getConfig('auth').getString('clientId'),
      clientSecret: portal.getConfig('auth').getString('clientSecret'),
    },
  }));

  router.get('/health', (_, response) => {
    response.json({ status: 'ok' });
  });

  // Helper function to get access token
  const getAccessToken = async (portal: typeof trainingPortals[0]) => {
    const tokenResponse = await fetch(`${portal.url}/oauth2/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${portal.auth.clientId}:${portal.auth.clientSecret}`).toString('base64')}`,
      },
      body: `grant_type=password&username=${encodeURIComponent(portal.auth.robotUsername)}&password=${encodeURIComponent(portal.auth.robotPassword)}`,
    });

    if (!tokenResponse.ok) {
      throw new Error(`Failed to get access token: ${tokenResponse.statusText}`);
    }

    return await tokenResponse.json();
  };

  router.get('/workshops/:portalName', async (req, res) => {
    const { portalName } = req.params;
    const portal = trainingPortals.find(p => p.name === portalName);
    if (!portal) {
      res.status(404).json({ error: 'Training portal not found' });
      return;
    }

    try {
      // Check permission to view this specific portal
      const credentials = await httpAuth.credentials(req, { allow: ['user'] });
      const decision = await permissions.authorize(
        [{ permission: portalViewPermission, resourceRef: portalName }],
        { credentials }
      );

      if (decision[0].result !== AuthorizeResult.ALLOW) {
        res.status(403).json({ error: 'Access denied to this training portal' });
        return;
      }

      // Get access token
      const tokenData = await getAccessToken(portal);
      const accessToken = tokenData.access_token;

      // Get workshops catalog
      const catalogResponse = await fetch(`${portal.url}/workshops/catalog/workshops/`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!catalogResponse.ok) {
        throw new Error(`Failed to get workshops catalog: ${catalogResponse.statusText}`);
      }

      const catalogData = await catalogResponse.json();
      res.json(catalogData);
    } catch (err) {
      logger.error(`Failed to get workshops catalog: ${err}`);
      res.status(500).json({ error: 'Failed to get workshops catalog' });
    }
  });

  router.post('/workshops/:portalName/token', async (req, res) => {
    const { portalName } = req.params;
    const portal = trainingPortals.find(p => p.name === portalName);
    if (!portal) {
      res.status(404).json({ error: 'Training portal not found' });
      return;
    }

    try {
      // Check permission to view this specific portal
      const credentials = await httpAuth.credentials(req, { allow: ['user'] });
      const decision = await permissions.authorize(
        [{ permission: portalViewPermission, resourceRef: portalName }],
        { credentials }
      );

      if (decision[0].result !== AuthorizeResult.ALLOW) {
        res.status(403).json({ error: 'Access denied to this training portal' });
        return;
      }

      // Get access token
      const tokenData = await getAccessToken(portal);
      res.json(tokenData);
    } catch (err) {
      logger.error(`Failed to get access token: ${err}`);
      res.status(500).json({ error: 'Failed to get access token' });
    }
  });

  router.post('/workshops/:portalName/:workshopEnvName/request', async (req, res) => {
    const { portalName, workshopEnvName } = req.params;
    const portal = trainingPortals.find(p => p.name === portalName);
    if (!portal) {
      res.status(404).json({ error: 'Training portal not found' });
      return;
    }

    try {
      // Get access token first to fetch workshop catalog
      const tokenData = await getAccessToken(portal);
      const accessToken = tokenData.access_token;

      // Get workshops catalog to find the workshop name for permission checking
      const catalogResponse = await fetch(`${portal.url}/workshops/catalog/workshops/`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!catalogResponse.ok) {
        logger.error(`Failed to get workshops catalog: ${catalogResponse.status} ${catalogResponse.statusText}`);
        throw new Error(`Failed to get workshops catalog: ${catalogResponse.statusText}`);
      }

      const catalogData = await catalogResponse.json();
      logger.info(`Looking for workshop with environment name: ${workshopEnvName}`);
      logger.info(`Available workshops: ${catalogData.workshops?.map((w: any) => `${w.name} (env: ${w.environment.name})`).join(', ')}`);
      
      const workshop = catalogData.workshops?.find((w: any) => w.environment.name === workshopEnvName);
      
      if (!workshop) {
        logger.error(`Workshop not found with environment name: ${workshopEnvName}`);
        res.status(404).json({ error: `Workshop not found with environment name: ${workshopEnvName}` });
        return;
      }

      logger.info(`Found workshop: ${workshop.name} for permission check`);

      // Check permission to start this specific workshop using workshop name
      const credentials = await httpAuth.credentials(req, { allow: ['user'] });
      const decision = await permissions.authorize(
        [{ permission: workshopStartPermission, resourceRef: `${portalName}:${workshop.name}` }],
        { credentials }
      );

      if (decision[0].result !== AuthorizeResult.ALLOW) {
        res.status(403).json({ error: 'Access denied to start this workshop' });
        return;
      }
      const appBaseUrl = config.getString('app.baseUrl');
      const indexUrl = `${appBaseUrl}/educates`;
      // Request workshop session using the correct Educates API endpoint
      const sessionUrl = `${portal.url}/workshops/environment/${workshopEnvName}/request/?index_url=${encodeURIComponent(indexUrl)}`;
      logger.info(`Requesting workshop session from: ${sessionUrl}`);
      
      const sessionResponse = await fetch(sessionUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!sessionResponse.ok) {
        logger.error(`Workshop session request failed: ${sessionResponse.status} ${sessionResponse.statusText}`);
        logger.error(`Request URL: ${sessionUrl}`);
        throw new Error(`Failed to request workshop session: ${sessionResponse.statusText}`);
      }

      const sessionData = await sessionResponse.json();
      res.json({
        ...sessionData,
        url: `${portal.url}${sessionData.url}` 
      });
    } catch (err) {
      logger.error(`Failed to request workshop: ${err}`);
      res.status(500).json({ error: 'Failed to request workshop' });
    }
  });

  return router;
} 