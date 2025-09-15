import {
  KubernetesBuilder,
  KubernetesObjectTypes,
} from '@backstage/plugin-kubernetes-backend';
import { CatalogApi } from '@backstage/catalog-client';
import { PermissionEvaluator } from '@backstage/plugin-permission-common';
import { Config } from '@backstage/config';
import {
  LoggerService,
  DiscoveryService,
  HttpAuthService,
  AuthService,
} from '@backstage/backend-plugin-api';
import { ANNOTATION_KUBERNETES_AUTH_PROVIDER } from '@backstage/plugin-kubernetes-common';
import { getAuthCredential } from '../auth';

type ObjectToFetch = {
  group: string;
  apiVersion: string;
  plural: string;
  objectType: KubernetesObjectTypes;
};

export class XrdDataProvider {
  logger: LoggerService;
  config: Config;
  catalogApi: CatalogApi;
  permissions: PermissionEvaluator;
  discovery: DiscoveryService;
  auth?: AuthService;
  httpAuth?: HttpAuthService;

  private getAnnotationPrefix(): string {
    return (
      this.config.getOptionalString('kubernetesIngestor.annotationPrefix') ||
      'terasky.backstage.io'
    );
  }

  constructor(
    logger: LoggerService,
    config: Config,
    catalogApi: CatalogApi,
    discovery: DiscoveryService,
    permissions: PermissionEvaluator,
    auth?: AuthService,
    httpAuth?: HttpAuthService,
  ) {
    this.logger = logger;
    this.config = config;
    this.catalogApi = catalogApi;
    this.permissions = permissions;
    this.discovery = discovery;
    this.auth = auth;
    this.httpAuth = httpAuth;
  }

  async fetchXRDObjects(): Promise<any[]> {
    try {
      const builder = KubernetesBuilder.createBuilder({
        logger: this.logger,
        config: this.config,
        catalogApi: this.catalogApi,
        permissions: this.permissions,
        discovery: this.discovery,
      });

      const globalAuthStrategies = (global as any).kubernetesAuthStrategies;
      if (globalAuthStrategies) {
        for (const [key, strategy] of globalAuthStrategies) {
          this.logger.debug(`Adding auth strategy: ${key}`);
          builder.addAuthStrategy(key, strategy);
        }
      }

      const { fetcher, clusterSupplier } = await builder.build();

      const credentials = {
        $$type: '@backstage/BackstageCredentials' as const,
        principal: 'anonymous',
      };

      const clusters = await clusterSupplier.getClusters({ credentials });

      if (clusters.length === 0) {
        this.logger.warn('No clusters found.');
        return [];
      }

      const ingestAllXRDs =
        this.config.getOptionalBoolean(
          'kubernetesIngestor.crossplane.xrds.ingestAllXRDs',
        ) ?? false;

      let allFetchedObjects: any[] = [];
      const xrdMap = new Map<string, any>();
      const allowedClusters = this.config.getOptionalStringArray("kubernetesIngestor.allowedClusterNames");
      for (const cluster of clusters) {
        if (allowedClusters && !allowedClusters.includes(cluster.name)) {
          this.logger.debug(`Skipping cluster: ${cluster.name} as it is not included in the allowedClusterNames configuration.`);
          continue;
        }
        // Get the auth provider type from the cluster config
        const authProvider =
          cluster.authMetadata[ANNOTATION_KUBERNETES_AUTH_PROVIDER] ||
          'serviceAccount';

        // Get the auth credentials based on the provider type
        let credential;
        try {
          credential = await getAuthCredential(
            cluster,
            authProvider,
            this.config,
            this.logger,
          );
        } catch (error) {
          if (error instanceof Error) {
            this.logger.error(
              `Failed to get auth credentials for cluster ${cluster.name} with provider ${authProvider}:`,
              error,
            );
          } else {
            this.logger.error(
              `Failed to get auth credentials for cluster ${cluster.name} with provider ${authProvider}:`,
              {
                error: String(error),
              },
            );
          }
          continue;
        }

        try {
          // Fetch all XRDs
          const objectTypesToFetch: Set<ObjectToFetch> = new Set([
            {
              group: 'apiextensions.crossplane.io',
              apiVersion: 'v1',
              plural: 'compositeresourcedefinitions',
              objectType: 'customresources' as KubernetesObjectTypes,
            },
            {
              group: 'apiextensions.crossplane.io',
              apiVersion: 'v2',
              plural: 'compositeresourcedefinitions',
              objectType: 'customresources' as KubernetesObjectTypes,
            },
          ]);

          const fetchedObjects = await fetcher.fetchObjectsForService({
            serviceId: 'xrdServiceId',
            clusterDetails: cluster,
            credential,
            objectTypesToFetch,
            labelSelector: '',
            customResources: [],
          });

          // Fetch all CRDs ONCE for this cluster
          const crdObjects = await fetcher.fetchObjectsForService({
            serviceId: 'crdServiceId',
            clusterDetails: cluster,
            credential,
            objectTypesToFetch: new Set([
              {
                group: 'apiextensions.k8s.io',
                apiVersion: 'v1',
                plural: 'customresourcedefinitions',
                objectType: 'customresources' as KubernetesObjectTypes,
              },
            ]),
            labelSelector: '',
            customResources: [],
          });
          const crdMap = new Map(
            crdObjects.responses
              .flatMap((response: any) => response.resources)
              .map((crd: any) => [crd.metadata.name, crd])
          );

          const fetchedResources = fetchedObjects.responses.flatMap(response =>
            response.resources.map(resource => {
              // Detect Crossplane version and scope
              const isV2 = !!resource.spec?.scope;
              const crossplaneVersion = isV2 ? 'v2' : 'v1';
              const scope = resource.spec?.scope || (isV2 ? 'LegacyCluster' : 'Cluster');
              // Attach the generated CRD if present
              const generatedCRD = crdMap.get(resource.metadata.name);
              return {
                ...resource,
                clusterName: cluster.name,
                clusterEndpoint: cluster.url,
                crossplaneVersion,
                scope,
                generatedCRD,
              };
            })
          );
          const prefix = this.getAnnotationPrefix();
          const filteredObjects = fetchedResources
            .filter(resource => {
              if (
                resource.metadata.annotations?.[
                `${prefix}/exclude-from-catalog`
                ]
              ) {
                return false;
              }

              if (
                !ingestAllXRDs &&
                !resource.metadata.annotations?.[`${prefix}/add-to-catalog`]
              ) {
                return false;
              }

              // Only require claimNames.kind for v1 and v2-LegacyCluster XRDs
              const isV2 = resource.apiVersion === 'apiextensions.crossplane.io/v2';
              const scope = resource.spec?.scope || (isV2 ? 'Namespaced' : 'Cluster');
              const isLegacyCluster = isV2 && scope === 'LegacyCluster';

              if (!isV2 && !resource.spec?.claimNames?.kind) {
                return false;
              }
              if (isV2 && isLegacyCluster && !resource.spec?.claimNames?.kind) {
                return false;
              }
              // For v2 Cluster/Namespaced, allow through even if claimNames is missing
              return true;
            })
            .map(resource => ({
              ...resource,
              clusterName: cluster.name, // Attach the cluster name to the resource
              clusterEndpoint: cluster.url, // Attach the cluster endpoint to the resource
            }));

          allFetchedObjects = allFetchedObjects.concat(filteredObjects);

          this.logger.debug(
            `Fetched ${filteredObjects.length} objects from cluster: ${cluster.name}`,
          );

          // Fetch all compositions from the cluster
          const compositions = await fetcher.fetchObjectsForService({
            serviceId: 'compositionServiceId',
            clusterDetails: cluster,
            credential,
            objectTypesToFetch: new Set([
              {
                group: 'apiextensions.crossplane.io',
                apiVersion: 'v1',
                plural: 'compositions',
                objectType: 'customresources' as KubernetesObjectTypes,
              },
            ]),
            labelSelector: '',
            customResources: [],
          });

          const fetchedCompositions = compositions.responses.flatMap(response =>
            response.resources.map(resource => ({
              ...resource,
              clusterName: cluster.name,
              clusterEndpoint: cluster.url,
            })),
          );

          // Group XRDs by their name and add clusters and compositions information
          allFetchedObjects.forEach(xrd => {
            const xrdName = xrd.metadata.name;
            const compositeType = xrd.status?.controllers?.compositeResourceType;
            
            // Check if compositeType exists and has valid values
            // If not (e.g., Configuration-managed XRDs), fallback to spec values
            let effectiveKind = compositeType?.kind;
            let effectiveApiVersion = compositeType?.apiVersion;
            
            if (!compositeType || !compositeType.kind || !compositeType.apiVersion || compositeType.kind === "" || compositeType.apiVersion === "") {
              // Fallback to XRD spec for Configuration-managed XRDs
              effectiveKind = xrd.spec?.names?.kind;
              effectiveApiVersion = xrd.spec?.group && xrd.spec?.versions?.[0]?.name 
                ? `${xrd.spec.group}/${xrd.spec.versions[0].name}`
                : undefined;
              
              if (!effectiveKind || !effectiveApiVersion) {
                this.logger.error(
                  `XRD ${xrdName} has invalid controllers status and cannot derive composite type from spec. Kind: ${effectiveKind}, ApiVersion: ${effectiveApiVersion}. Skipping Software Template creation.`,
                );
                return; // Skip this XRD
              }
              
              this.logger.info(
                `XRD ${xrdName} has empty controllers status (likely Configuration-managed). Using fallback: Kind: ${effectiveKind}, ApiVersion: ${effectiveApiVersion}`,
              );
            }

            if (!xrdMap.has(xrdName)) {
              xrdMap.set(xrdName, {
                ...xrd,
                clusters: [xrd.clusterName],
                clusterDetails: [
                  { name: xrd.clusterName, url: xrd.clusterEndpoint },
                ],
                compositions: [],
                generatedCRD: xrd.generatedCRD, // Attach the generated CRD if present
                // Store effective values for later use in composition matching
                effectiveCompositeType: {
                  kind: effectiveKind,
                  apiVersion: effectiveApiVersion,
                },
              });
            } else {
              const existingXrd = xrdMap.get(xrdName);
              if (!existingXrd.clusters.includes(xrd.clusterName)) {
                existingXrd.clusters.push(xrd.clusterName);
                existingXrd.clusterDetails.push({
                  name: xrd.clusterName,
                  url: xrd.clusterEndpoint,
                });
              }
            }
          });

          // Add compositions to the corresponding XRDs
          fetchedCompositions.forEach(composition => {
            const { apiVersion, kind } = composition.spec.compositeTypeRef;
            xrdMap.forEach(xrd => {
              // Use effective values for matching (handles both normal and Configuration-managed XRDs)
              const effectiveType = xrd.effectiveCompositeType || xrd.status?.controllers?.compositeResourceType;
              const { apiVersion: xrdApiVersion, kind: xrdKind } = effectiveType || {};
              
              if (apiVersion === xrdApiVersion && kind === xrdKind) {
                if (!xrd.compositions.includes(composition.metadata.name)) {
                  xrd.compositions.push(composition.metadata.name);
                }
              }
            });
          });
        } catch (clusterError) {
          if (clusterError instanceof Error) {
            this.logger.error(
              `Failed to fetch XRD objects for cluster ${cluster.name}: ${clusterError.message}`,
              clusterError,
            );
          } else {
            this.logger.error(
              `Failed to fetch XRD objects for cluster ${cluster.name}:`,
              {
                error: String(clusterError),
              },
            );
          }
        }
      }

      this.logger.debug(
        `Total fetched XRD objects: ${allFetchedObjects.length}`,
      );

      return Array.from(xrdMap.values());
    } catch (error) {
      this.logger.error('Error fetching XRD objects');
      throw error;
    }
  }

  // Returns a lookup of composite kinds (and optionally group/version) to XRD metadata for v2 XRDs that are not LegacyCluster
  async buildCompositeKindLookup(): Promise<Record<string, any>> {
    const xrdObjects = await this.fetchXRDObjects();
    const lookup: Record<string, any> = {};
    for (const xrd of xrdObjects) {
      const isV2 = !!xrd.spec?.scope;
      const scope = xrd.spec?.scope || (isV2 ? 'LegacyCluster' : 'Cluster');
      if (isV2 && scope !== 'LegacyCluster') {
        const kind = xrd.spec?.names?.kind;
        const group = xrd.spec?.group;
        for (const version of xrd.spec.versions || []) {
          const versionName = version.name;
          const key = `${kind}|${group}|${versionName}`;
          const lowerKey = `${kind?.toLowerCase()}|${group}|${versionName}`;
          lookup[key] = xrd;
          lookup[lowerKey] = xrd;
        }
      }
    }
    return lookup;
  }
}
