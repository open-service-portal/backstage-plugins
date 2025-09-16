import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { Entity } from '@backstage/catalog-model';
import { Config } from '@backstage/config';
import { LoggerService, SchedulerServiceTaskRunner } from '@backstage/backend-plugin-api';
import { DefaultKubernetesResourceFetcher } from '../services';
import { Logger } from 'winston';
import { CRDDataProvider } from '../providers/CRDDataProvider';
import { XRDDataProvider } from '../providers/XRDDataProvider';
import yaml from 'js-yaml';

export class XRDTemplateEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;

  constructor(
    private readonly taskRunner: SchedulerServiceTaskRunner,
    logger: LoggerService,
    private readonly config: Config,
    private readonly resourceFetcher: DefaultKubernetesResourceFetcher,
  ) {
    this.logger = {
      silent: true,
      format: undefined,
      levels: { error: 0, warn: 1, info: 2, debug: 3 },
      level: 'warn',
      error: logger.error.bind(logger),
      warn: logger.warn.bind(logger),
      info: logger.info.bind(logger),
      debug: logger.debug.bind(logger),
      transports: [],
      exceptions: { handle() {} },
      rejections: { handle() {} },
      profilers: {},
      exitOnError: false,
      log: (level: string, msg: string) => {
        switch (level) {
          case 'error': logger.error(msg); break;
          case 'warn': logger.warn(msg); break;
          case 'info': logger.info(msg); break;
          case 'debug': logger.debug(msg); break;
          default: logger.info(msg);
        }
      },
    } as unknown as Logger;
  }

  private readonly logger: Logger;

  private validateEntityName(entity: Entity): boolean {
    if (entity.metadata.name.length > 63) {
      this.logger.warn(
        `The entity ${entity.metadata.name} of type ${entity.kind} cant be ingested as its auto generated name would be over 63 characters long. please consider chaning the naming conventions via the config of the plugin or shorten the names in the relevant sources of info to allow this resource to be ingested.`
      );
      return false;
    }
    return true;
  }

  private getAnnotationPrefix(): string {
    return this.config.getOptionalString('kubernetesIngestor.annotationPrefix') || 'terasky.backstage.io';
  }

  getProviderName(): string {
    return 'XRDTemplateEntityProvider';
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    await this.taskRunner.run({
      id: this.getProviderName(),
      fn: async () => {
        await this.run();
      },
    });
  }

  async run(): Promise<void> {
    if (!this.connection) {
      throw new Error('Connection not initialized');
    }
    try {
      const isCrossplaneEnabled = this.config.getOptionalBoolean('kubernetesIngestor.crossplane.enabled') ?? true;

      if (!isCrossplaneEnabled) {
        await this.connection.applyMutation({
          type: 'full',
          entities: [],
        });
        return;
      }

      const templateDataProvider = new XRDDataProvider(
        this.resourceFetcher,
        this.config,
        this.logger,
      );

      const crdDataProvider = new CRDDataProvider(
        this.resourceFetcher,
        this.config,
        this.logger,
      );

      let allEntities: Entity[] = [];

      // Fetch all CRDs once
      const crdData = await crdDataProvider.fetchCRDObjects();

      if (this.config.getOptionalBoolean('kubernetesIngestor.crossplane.xrds.enabled')) {
        const xrdData = await templateDataProvider.fetchXRDObjects();
        const xrdEntities = xrdData.flatMap((xrd: any) => this.translateXRDVersionsToTemplates(xrd));
        const APIEntities = xrdData.flatMap((xrd: any) => this.translateXRDVersionsToAPI(xrd));
        allEntities = allEntities.concat(xrdEntities, APIEntities);
      }

      // Add CRD template generation
      const crdEntities = crdData.flatMap(crd => this.translateCRDToTemplate(crd));
      const CRDAPIEntities = crdData.flatMap(crd => this.translateCRDVersionsToAPI(crd));
      allEntities = allEntities.concat(crdEntities, CRDAPIEntities);

      await this.connection.applyMutation({
        type: 'full',
        entities: allEntities.map(entity => ({
          entity,
          locationKey: `provider:${this.getProviderName()}`,
        })),
      });
    } catch (error) {
      this.logger.error(`Failed to run TemplateEntityProvider: ${error}`);
    }
  }

  private translateXRDVersionsToTemplates(xrd: any): Entity[] {
    if (!xrd?.metadata || !xrd?.spec) {
      this.logger.warn(`Skipping XRD ${xrd?.metadata?.name || 'unknown'} due to missing metadata or spec`);
      return [];
    }

    if (!Array.isArray(xrd.spec.versions) || xrd.spec.versions.length === 0) {
      this.logger.warn(`Skipping XRD ${xrd.metadata.name} due to missing or empty versions array`);
      return [];
    }
    // --- BEGIN VERSION/SCOPE LOGIC REFACTOR ---
    // Use presence of xrd.spec.scope to determine v2, otherwise v1
    const isV2 = !!xrd.spec?.scope;
    const crossplaneVersion = isV2 ? 'v2' : 'v1';
    const scope = xrd.spec?.scope || (isV2 ? 'LegacyCluster' : 'Cluster');
    const isLegacyCluster = isV2 && scope === 'LegacyCluster';
    const isCluster = scope === 'Cluster';
    const isNamespaced = scope === 'Namespaced';
    // --- END VERSION/SCOPE LOGIC REFACTOR ---
    const clusters = xrd.clusters || ["kubetopus"];
    const templates = xrd.spec.versions.map((version: { name: any }) => {
      // For v2 Cluster/Namespaced, do not generate claim-based templates
      if (isV2 && !isLegacyCluster && (isCluster || isNamespaced)) {
        // No claimNames, use spec.name as resource type
        const parameters = this.extractParameters(version, clusters, xrd);
        const prefix = this.getAnnotationPrefix();
        const steps = this.extractSteps(version, xrd);
        const clusterTags = clusters.map((cluster: any) => `cluster:${cluster}`);
        const tags = ['crossplane', ...clusterTags];
        const crossplaneAnnotations = {
          [`${prefix}/crossplane-version`]: crossplaneVersion,
          [`${prefix}/crossplane-scope`]: scope,
        };
        return {
          apiVersion: 'scaffolder.backstage.io/v1beta3',
          kind: 'Template',
          metadata: {
            name: `${xrd.metadata.name}-${version.name}`,
            title: `${xrd.spec.claimNames?.kind || xrd.spec.names?.kind}`,
            description: `A template to create a ${xrd.metadata.name} instance`,
            labels: {
              forEntity: "system",
              source: "crossplane",
            },
            tags: tags,
            annotations: {
              'backstage.io/managed-by-location': `cluster origin: ${xrd.clusterName}`,
              'backstage.io/managed-by-origin-location': `cluster origin: ${xrd.clusterName}`,
              ...crossplaneAnnotations,
            },
          },
          spec: {
            type: xrd.metadata.name,
            parameters,
            steps,
            output: {
              links: [
                {
                  title: 'Download YAML Manifest',
                  url: 'data:application/yaml;charset=utf-8,${{ steps.generateManifest.output.manifest }}'
                },
                {
                  title: 'Open Pull Request',
                  if: '${{ parameters.pushToGit }}',
                  url: this.getPullRequestUrl()
                }
              ]
            },
          },
        };
      }
      // v1 or v2 LegacyCluster or claim-based
      const parameters = this.extractParameters(version, clusters, xrd);
      const prefix = this.getAnnotationPrefix();
      const steps = this.extractSteps(version, xrd);
      const clusterTags = clusters.map((cluster: any) => `cluster:${cluster}`);
      const tags = ['crossplane', ...clusterTags];
      const crossplaneAnnotations = {
        [`${prefix}/crossplane-version`]: crossplaneVersion,
        [`${prefix}/crossplane-scope`]: scope,
      };
      return {
        apiVersion: 'scaffolder.backstage.io/v1beta3',
        kind: 'Template',
        metadata: {
          name: `${xrd.metadata.name}-${version.name}`,
          title: `${xrd.spec.claimNames?.kind || xrd.spec.names?.kind}`,
          description: `A template to create a ${xrd.metadata.name} instance`,
          labels: {
            forEntity: "system",
            source: "crossplane",
          },
          tags: tags,
          annotations: {
            'backstage.io/managed-by-location': `cluster origin: ${xrd.clusterName}`,
            'backstage.io/managed-by-origin-location': `cluster origin: ${xrd.clusterName}`,
            [`${prefix}/crossplane-claim`]: 'true',
            ...crossplaneAnnotations,
          },
        },
        spec: {
          type: xrd.metadata.name,
          parameters,
          steps,
          output: {
            links: [
              {
                title: 'Download YAML Manifest',
                url: 'data:application/yaml;charset=utf-8,${{ steps.generateManifest.output.manifest }}'
              },
              {
                title: 'Open Pull Request',
                if: '${{ parameters.pushToGit }}',
                url: this.getPullRequestUrl()
              }
            ]
          },
        },
      };
    });
    // Filter out invalid templates
    return templates.filter((template: Entity) => this.validateEntityName(template));
  }

  private translateXRDVersionsToAPI(xrd: any): Entity[] {
    if (!xrd?.metadata || !xrd?.spec) {
      this.logger.warn(`Skipping XRD API generation for ${xrd?.metadata?.name || 'unknown'} due to missing metadata or spec`);
      return [];
    }

    if (!Array.isArray(xrd.spec.versions) || xrd.spec.versions.length === 0) {
      this.logger.warn(`Skipping XRD API generation for ${xrd.metadata.name} due to missing or empty versions array`);
      return [];
    }

    // --- BEGIN VERSION/SCOPE LOGIC REFACTOR ---
    // Use presence of xrd.spec.scope to determine v2, otherwise v1
    const isV2 = !!xrd.spec?.scope;
    const scope = xrd.spec?.scope || (isV2 ? 'LegacyCluster' : 'Cluster');
    const isLegacyCluster = isV2 && scope === 'LegacyCluster';
    // --- END VERSION/SCOPE LOGIC REFACTOR ---
    // Prefer spec.names.plural/kind if available, fallback to metadata.name
    const resourcePlural = (!isV2 || isLegacyCluster)
      ? xrd.spec.claimNames?.plural
      : (xrd.spec.names?.plural || xrd.metadata.name);
    const resourceKind = (!isV2 || isLegacyCluster)
      ? xrd.spec.claimNames?.kind
      : (xrd.spec.names?.kind || xrd.metadata.name);

    const apis = xrd.spec.versions.map((version: any = {}) => {
      // Use the generated CRD's schema if present, otherwise fallback to XRD schema
      let crdSchemaProps = undefined;
      if (xrd.generatedCRD) {
        const crdVersion = xrd.generatedCRD.spec.versions.find((v: any) => v.name === version.name) ||
                           xrd.generatedCRD.spec.versions.find((v: any) => v.storage) ||
                           xrd.generatedCRD.spec.versions[0];
        crdSchemaProps = crdVersion?.schema?.openAPIV3Schema?.properties;
      }
      const schemaProps = crdSchemaProps || version.schema.openAPIV3Schema.properties;

      let xrdOpenAPIDoc: any = {};
      xrdOpenAPIDoc.openapi = "3.0.0";
      xrdOpenAPIDoc.info = {
        title: `${resourcePlural}.${xrd.spec.group}`,
        version: version.name,
      };
      xrdOpenAPIDoc.servers = xrd.clusterDetails.map((cluster: any) => ({
        url: cluster.url,
        description: cluster.name,
      }));
      xrdOpenAPIDoc.tags = [
        {
          name: "Cluster Scoped Operations",
          description: "Operations on the cluster level"
        },
        {
          name: "Namespace Scoped Operations",
          description: "Operations on the namespace level"
        },
        {
          name: "Specific Object Scoped Operations",
          description: "Operations on a specific resource"
        }
      ];
      // TODO(vrabbi) Add Paths To API for XRD
      xrdOpenAPIDoc.paths = {
        [`/apis/${xrd.spec.group}/${version.name}/${resourcePlural}`]: {
          get: {
            tags: ["Cluster Scoped Operations"],
            summary: `List all ${resourcePlural} in all namespaces`,
            operationId: `list${resourcePlural}AllNamespaces`,
            responses: {
              "200": {
                description: `List of ${resourcePlural} in all namespaces`,
                content: {
                  "application/json": {
                    schema: {
                      type: "array",
                      items: {
                        $ref: `#/components/schemas/Resource`
                      }
                    }
                  }
                }
              }
            }
          }
        },
        [`/apis/${xrd.spec.group}/${version.name}/namespaces/{namespace}/${resourcePlural}`]: {
          get: {
            tags: ["Namespace Scoped Operations"],
            summary: `List all ${resourcePlural} in a namespace`,
            operationId: `list${resourcePlural}`,
            parameters: [
              {
                name: "namespace",
                in: "path",
                required: true,
                schema: {
                  type: "string"
                }
              }
            ],
            responses: {
              "200": {
                description: `List of ${resourcePlural}`,
                content: {
                  "application/json": {
                    schema: {
                      type: "array",
                      items: {
                        $ref: `#/components/schemas/Resource`
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            tags: ["Namespace Scoped Operations"],
            summary: "Create a resource",
            operationId: "createResource",
            parameters: [
              { name: "namespace", in: "path", required: true, schema: { type: "string" } },
            ],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    $ref: `#/components/schemas/Resource`
                  }
                },
              },
            },
            responses: {
              "201": { description: "Resource created" },
            },
          },
        },
        [`/apis/${xrd.spec.group}/${version.name}/namespaces/{namespace}/${resourcePlural}/{name}`]: {
          get: {
            tags: ["Specific Object Scoped Operations"],
            summary: `Get a ${resourceKind}`,
            operationId: `get${resourceKind}`,
            parameters: [
              { name: "namespace", in: "path", required: true, schema: { type: "string" } },
              { name: "name", in: "path", required: true, schema: { type: "string" } },
            ],
            responses: {
              "200": {
                description: "Resource details",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      $ref: `#/components/schemas/Resource`
                    },
                  },
                },
              },
            },
          },
          put: {
            tags: ["Specific Object Scoped Operations"],
            summary: "Update a resource",
            operationId: "updateResource",
            parameters: [
              { name: "namespace", in: "path", required: true, schema: { type: "string" } },
              { name: "name", in: "path", required: true, schema: { type: "string" } },
            ],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    $ref: `#/components/schemas/Resource`
                  },
                },
              },
            },
            responses: {
              "200": { description: "Resource updated" },
            },
          },
          delete: {
            tags: ["Specific Object Scoped Operations"],
            summary: "Delete a resource",
            operationId: "deleteResource",
            parameters: [
              { name: "namespace", in: "path", required: true, schema: { type: "string" } },
              { name: "name", in: "path", required: true, schema: { type: "string" } },
            ],
            responses: {
              "200": { description: "Resource deleted" },
            },
          },
        },
      };
      xrdOpenAPIDoc.components = {
        schemas: {
          Resource: {
            type: "object",
            properties: schemaProps
          }
        },
        securitySchemes: {
          bearerHttpAuthentication: {
            description: "Bearer token using a JWT",
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT"
          }
        }
      };
      xrdOpenAPIDoc.security = [
        {
          bearerHttpAuthentication: []
        }
      ];
      return {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'API',
        metadata: {
          name: `${resourceKind?.toLowerCase()}-${xrd.spec.group}--${version.name}`,
          title: `${resourceKind?.toLowerCase()}-${xrd.spec.group}--${version.name}`,
          annotations: {
            'backstage.io/managed-by-location': `cluster origin: ${xrd.clusterName}`,
            'backstage.io/managed-by-origin-location': `cluster origin: ${xrd.clusterName}`,
          },
        },
        spec: {
          type: "openapi",
          lifecycle: "production",
          owner: "kubernetes-auto-ingested",
          system: "kubernets-auto-ingested",
          definition: yaml.dump(xrdOpenAPIDoc),
        },
      };
    });

    // Filter out invalid APIs
    return apis.filter((api: Entity) => this.validateEntityName(api));
  }

  private extractParameters(version: any, clusters: string[], xrd: any): any[] {
    // --- BEGIN VERSION/SCOPE LOGIC REFACTOR ---
    // Use presence of xrd.spec.scope to determine v2, otherwise v1
    const isV2 = !!xrd.spec?.scope;
    const scope = xrd.spec?.scope || (isV2 ? 'LegacyCluster' : 'Cluster');
    const isLegacyCluster = isV2 && scope === 'LegacyCluster';
    const isCluster = scope === 'Cluster';
    const isNamespaced = scope === 'Namespaced';
    // --- END VERSION/SCOPE LOGIC REFACTOR ---
    // Main parameter group
    let mainParameterGroup: any = {
      title: 'Resource Metadata',
      required: ['xrName', 'owner'],
      properties: {
        xrName: {
          title: 'Name',
          description: 'The name of the resource',
          pattern: "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$",
          maxLength: 63,
          type: 'string',
        }
      },
      type: 'object',
    };
    if ((isV2 && isNamespaced) || (!isV2) || isLegacyCluster) {
      mainParameterGroup.required.push('xrNamespace');
      mainParameterGroup.properties.xrNamespace = {
        title: 'Namespace',
        description: 'The namespace in which to create the resource',
        pattern: "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$",
        maxLength: 63,
        type: 'string',
      };
    }
    mainParameterGroup.properties.owner = {
      title: 'Owner',
      description: 'The owner of the resource',
      type: 'string',
      'ui:field': 'OwnerPicker',
      'ui:options': {
        'catalogFilter': {
          'kind': 'Group',
        },
      },
    };
    // Additional parameters
    const convertDefaultValuesToPlaceholders = this.config.getOptionalBoolean('kubernetesIngestor.crossplane.xrds.convertDefaultValuesToPlaceholders');
    const processProperties = (properties: Record<string, any>): Record<string, any> => {
      const processedProperties: Record<string, any> = {};
      for (const [key, value] of Object.entries(properties)) {
        const typedValue = value as Record<string, any>;

        // Handle fields with x-kubernetes-preserve-unknown-fields: true
        if (typedValue['x-kubernetes-preserve-unknown-fields'] === true && !typedValue.type) {
          processedProperties[key] = {
            ...typedValue,
            type: 'string',
            'ui:widget': 'textarea',
            'ui:options': {
              rows: 10,
            },
          };
        } else if (typedValue.type === 'object' && typedValue.properties) {
          const subProperties = processProperties(typedValue.properties);
          processedProperties[key] = { ...typedValue, properties: subProperties };
          if (typedValue.properties.enabled && typedValue.properties.enabled.type === 'boolean') {
            const siblingKeys = Object.keys(typedValue.properties).filter(k => k !== 'enabled');
            processedProperties[key].dependencies = {
              enabled: {
                if: {
                  properties: {
                    enabled: { const: true },
                  },
                },
                then: {
                  properties: siblingKeys.reduce((acc, k) => ({ ...acc, [k]: typedValue.properties[k] }), {}),
                },
              },
            };
            siblingKeys.forEach(k => delete processedProperties[key].properties[k]);
          }
        } else {
          if (convertDefaultValuesToPlaceholders && typedValue.default !== undefined && typedValue.type !== 'boolean') {
            processedProperties[key] = { ...typedValue, 'ui:placeholder': typedValue.default };
            delete processedProperties[key].default;
          } else {
            processedProperties[key] = typedValue;
          }
        }
      }
      return processedProperties;
    };
    const processedSpec = version.schema?.openAPIV3Schema?.properties?.spec
      ? processProperties(version.schema.openAPIV3Schema.properties.spec.properties)
      : {};
    const additionalParameters = {
      title: 'Resource Spec',
      properties: processedSpec,
      type: 'object',
    };
    // Crossplane settings
    let crossplaneParameters: any = null;
    if ((isV2 && (isCluster || isNamespaced)) && !isLegacyCluster) {
      // v2 Cluster/Namespaced: move crossplane settings under spec.crossplane, remove writeConnectionSecretToRef
      crossplaneParameters = {
        title: 'Crossplane Settings',
        properties: {
          crossplane: {
            title: 'Crossplane Configuration',
            type: 'object',
            properties: {
              compositionUpdatePolicy: {
                title: 'Composition Update Policy',
                enum: ['Automatic', 'Manual'],
                type: 'string',
              },
              compositionSelectionStrategy: {
                title: 'Composition Selection Strategy',
                description: 'How the composition should be selected.',
                enum: [
                  'runtime',
                  ...(xrd.compositions && xrd.compositions.length > 0 ? ['direct-reference'] : []),
                  'label-selector',
                ],
                default: 'runtime',
                type: 'string',
              },
            },
            dependencies: {
              compositionSelectionStrategy: {
                oneOf: [
                  {
                    properties: {
                      compositionSelectionStrategy: { enum: ['runtime'] },
                    },
                  },
                  ...(xrd.compositions && xrd.compositions.length > 0
                    ? [
                        {
                          properties: {
                            compositionSelectionStrategy: { enum: ['direct-reference'] },
                            compositionRef: {
                              title: 'Composition Reference',
                              properties: {
                                name: {
                                  type: 'string',
                                  title: 'Select A Composition By Name',
                                  enum: xrd.compositions,
                                  ...(xrd.spec?.defaultCompositionRef?.name && {
                                    default: xrd.spec.defaultCompositionRef.name,
                                  }),
                                },
                              },
                              required: ['name'],
                              type: 'object',
                            },
                          },
                        },
                      ]
                    : []),
                  {
                    properties: {
                      compositionSelectionStrategy: { enum: ['label-selector'] },
                      compositionSelector: {
                        title: 'Composition Selector',
                        properties: {
                          matchLabels: {
                            title: 'Match Labels',
                            additionalProperties: { type: 'string' },
                            type: 'object',
                          },
                        },
                        required: ['matchLabels'],
                        type: 'object',
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        type: 'object',
      };
    } else {
      // v1 or v2 LegacyCluster: keep current structure
      crossplaneParameters = {
        title: 'Crossplane Settings',
        properties: {
          writeConnectionSecretToRef: {
            title: 'Crossplane Configuration Details',
            properties: {
              name: {
                title: 'Connection Secret Name',
                type: 'string',
              },
            },
            type: 'object',
          },
          compositeDeletePolicy: {
            title: 'Composite Delete Policy',
            default: 'Background',
            enum: ['Background', 'Foreground'],
            type: 'string',
          },
          compositionUpdatePolicy: {
            title: 'Composition Update Policy',
            enum: ['Automatic', 'Manual'],
            type: 'string',
          },
          compositionSelectionStrategy: {
            title: 'Composition Selection Strategy',
            description: 'How the composition should be selected.',
            enum: [
              'runtime',
              ...(xrd.compositions && xrd.compositions.length > 0 ? ['direct-reference'] : []),
              'label-selector',
            ],
            default: 'runtime',
            type: 'string',
          },
        },
        dependencies: {
          compositionSelectionStrategy: {
            oneOf: [
              {
                properties: {
                  compositionSelectionStrategy: { enum: ['runtime'] },
                },
              },
              ...(xrd.compositions && xrd.compositions.length > 0
                ? [
                    {
                      properties: {
                        compositionSelectionStrategy: { enum: ['direct-reference'] },
                        compositionRef: {
                          title: 'Composition Reference',
                          properties: {
                            name: {
                              type: 'string',
                              title: 'Select A Composition By Name',
                              enum: xrd.compositions,
                              ...(xrd.spec?.defaultCompositionRef?.name && {
                                default: xrd.spec.defaultCompositionRef.name,
                              }),
                            },
                          },
                          required: ['name'],
                          type: 'object',
                        },
                      },
                    },
                  ]
                : []),
              {
                properties: {
                  compositionSelectionStrategy: { enum: ['label-selector'] },
                  compositionSelector: {
                    title: 'Composition Selector',
                    properties: {
                      matchLabels: {
                        title: 'Match Labels',
                        additionalProperties: { type: 'string' },
                        type: 'object',
                      },
                    },
                    required: ['matchLabels'],
                    type: 'object',
                  },
                },
              },
            ],
          },
        },
        type: 'object',
      };
    }
    // Publish parameters (unchanged)
    let allowedHosts: string[] = [];
    const publishPhaseTarget = this.config.getOptionalString('kubernetesIngestor.crossplane.xrds.publishPhase.target')?.toLowerCase();
    const allowedTargets = this.config.getOptionalStringArray('kubernetesIngestor.crossplane.xrds.publishPhase.allowedTargets');
    if (allowedTargets) {
      allowedHosts = allowedTargets;
    } else {
      switch (publishPhaseTarget) {
        case 'github':
          allowedHosts = ['github.com'];
          break;
        case 'gitlab':
          allowedHosts = ['gitlab.com'];
          break;
        case 'bitbucket':
          allowedHosts = ['only-bitbucket-server-is-allowed'];
          break;
        case 'bitbucketcloud':
          allowedHosts = ['bitbucket.org'];
          break;
        default:
          allowedHosts = [];
      }
    }
    const publishParameters = this.config.getOptionalBoolean('kubernetesIngestor.crossplane.xrds.publishPhase.allowRepoSelection')
      ? {
        title: 'Creation Settings',
        properties: {
          pushToGit: {
            title: 'Push Manifest to GitOps Repository',
            type: 'boolean',
            default: true,
          },
        },
        dependencies: {
          pushToGit: {
            oneOf: [
              {
                properties: {
                  pushToGit: { enum: [false] },
                },
              },
              {
                properties: {
                  pushToGit: { enum: [true] },
                  repoUrl: {
                    content: { type: 'string' },
                    description: 'Name of repository',
                    'ui:field': 'RepoUrlPicker',
                    'ui:options': {
                      allowedHosts: allowedHosts,
                    },
                  },
                  targetBranch: {
                    type: 'string',
                    description: 'Target Branch for the PR',
                    default: 'main',
                  },
                  manifestLayout: {
                    type: 'string',
                    description: 'Layout of the manifest',
                    default: 'cluster-scoped',
                    'ui:help':
                      'Choose how the manifest should be generated in the repo.\n* Cluster-scoped - a manifest is created for each selected cluster under the root directory of the clusters name\n* namespace-scoped - a manifest is created for the resource under the root directory with the namespace name\n* custom - a manifest is created under the specified base path',
                    enum: ['cluster-scoped', 'namespace-scoped', 'custom'],
                  },
                },
                dependencies: {
                  manifestLayout: {
                    oneOf: [
                      {
                        properties: {
                          manifestLayout: { enum: ['cluster-scoped'] },
                          clusters: {
                            title: 'Target Clusters',
                            description: 'The target clusters to apply the resource to',
                            type: 'array',
                            minItems: 1,
                            items: {
                              enum: clusters,
                              type: 'string',
                            },
                            uniqueItems: true,
                            'ui:widget': 'checkboxes',
                          },
                        },
                        required: ['clusters'],
                      },
                      {
                        properties: {
                          manifestLayout: { enum: ['custom'] },
                          basePath: {
                            type: 'string',
                            description: 'Base path in GitOps repository to push the manifest to',
                          },
                        },
                        required: ['basePath'],
                      },
                      {
                        properties: {
                          manifestLayout: { enum: ['namespace-scoped'] },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      }
      : {
        title: 'Creation Settings',
        properties: {
          pushToGit: {
            title: 'Push Manifest to GitOps Repository',
            type: 'boolean',
            default: true,
          },
        },
        dependencies: {
          pushToGit: {
            oneOf: [
              {
                properties: {
                  pushToGit: { enum: [false] },
                },
              },
              {
                properties: {
                  pushToGit: { enum: [true] },
                  manifestLayout: {
                    type: 'string',
                    description: 'Layout of the manifest',
                    default: 'cluster-scoped',
                    'ui:help':
                      'Choose how the manifest should be generated in the repo.\n* Cluster-scoped - a manifest is created for each selected cluster under the root directory of the clusters name\n* namespace-scoped - a manifest is created for the resource under the root directory with the namespace name\n* custom - a manifest is created under the specified base path',
                    enum: ['cluster-scoped', 'namespace-scoped', 'custom'],
                  },
                },
                dependencies: {
                  manifestLayout: {
                    oneOf: [
                      {
                        properties: {
                          manifestLayout: { enum: ['cluster-scoped'] },
                          clusters: {
                            title: 'Target Clusters',
                            description: 'The target clusters to apply the resource to',
                            type: 'array',
                            minItems: 1,
                            items: {
                              enum: clusters,
                              type: 'string',
                            },
                            uniqueItems: true,
                            'ui:widget': 'checkboxes',
                          },
                        },
                        required: ['clusters'],
                      },
                      {
                        properties: {
                          manifestLayout: { enum: ['custom'] },
                          basePath: {
                            type: 'string',
                            description: 'Base path in GitOps repository to push the manifest to',
                          },
                        },
                        required: ['basePath'],
                      },
                      {
                        properties: {
                          manifestLayout: { enum: ['namespace-scoped'] },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      };
    // Compose parameter groups
    const paramGroups = [mainParameterGroup, additionalParameters];
    if (crossplaneParameters) paramGroups.push(crossplaneParameters);
    paramGroups.push(publishParameters);
    return paramGroups;
  }

  private extractSteps(version: any, xrd: any): any[] {
    // --- BEGIN VERSION/SCOPE LOGIC REFACTOR ---
    // Use presence of xrd.spec.scope to determine v2, otherwise v1
    const isV2 = !!xrd.spec?.scope;
    const scope = xrd.spec?.scope || (isV2 ? 'LegacyCluster' : 'LegacyCluster');
    const isLegacyCluster = isV2 && scope === 'LegacyCluster';
    const isCluster = scope === 'Cluster';
    const isNamespaced = scope === 'Namespaced';
    // --- END VERSION/SCOPE LOGIC REFACTOR ---
    let baseStepsYaml = '';
    // Compose the YAML as a string, not a template literal with JS expressions inside
    if (isV2 && (isCluster || isNamespaced) && !isLegacyCluster) {
      // v2 Cluster/Namespaced: no claim, use resource template action, only set namespaceParam if Namespaced
      baseStepsYaml =
        '- id: generateManifest\n' +
        '  name: Generate Kubernetes Resource Manifest\n' +
        '  action: terasky:claim-template\n' +
        '  input:\n' +
        '    parameters: ${{ parameters }}\n' +
        '    nameParam: xrName\n' +
        (isNamespaced ? '    namespaceParam: xrNamespace\n' : '    namespaceParam: ""\n') +
        '    ownerParam: owner\n' +
        '    excludeParams: [\'crossplane.compositionSelectionStrategy\',\'owner\',\'pushToGit\',\'basePath\',\'manifestLayout\',\'_editData\',\'targetBranch\',\'repoUrl\',\'clusters\',\'xrName\'' + (isNamespaced ? ', \'xrNamespace\'' : '') + ']\n' +
        '    apiVersion: {API_VERSION}\n' +
        '    kind: {KIND}\n' +
        '    clusters: ${{ parameters.clusters if parameters.manifestLayout === \'cluster-scoped\' and parameters.pushToGit else [\'temp\'] }}\n' +
        '    removeEmptyParams: true\n';
      if (isNamespaced) {
        baseStepsYaml +=
          '- id: moveNamespacedManifest\n' +
          '  name: Move and Rename Manifest\n' +
          '  if: ${{ parameters.manifestLayout === \'namespace-scoped\' }}\n' +
          '  action: fs:rename\n' +
          '  input:\n' +
          '    files:\n' +
          '      - from: ${{ steps.generateManifest.output.filePaths[0] }}\n' +
          '        to: "./${{ parameters.xrNamespace }}/${{ steps.generateManifest.input.kind }}/${{ steps.generateManifest.output.filePaths[0].split(\'/\').pop() }}"\n';
      }
      baseStepsYaml +=
        '- id: moveCustomManifest\n' +
        '  name: Move and Rename Manifest\n' +
        '  if: ${{ parameters.manifestLayout === \'custom\' }}\n' +
        '  action: fs:rename\n' +
        '  input:\n' +
        '    files:\n' +
        '      - from: ${{ steps.generateManifest.output.filePaths[0] }}\n' +
        '        to: "./${{ parameters.basePath }}/${{ parameters.xrName }}.yaml"'; // <-- removed trailing newline
    } else {
      // v1 or v2 LegacyCluster: keep current logic
      baseStepsYaml =
        '- id: generateManifest\n' +
        '  name: Generate Kubernetes Resource Manifest\n' +
        '  action: terasky:claim-template\n' +
        '  input:\n' +
        '    parameters: ${{ parameters }}\n' +
        '    nameParam: xrName\n' +
        '    namespaceParam: xrNamespace\n' +
        '    ownerParam: owner\n' +
        '    excludeParams: [\'owner\', \'compositionSelectionStrategy\',\'pushToGit\',\'basePath\',\'manifestLayout\',\'_editData\', \'targetBranch\', \'repoUrl\', \'clusters\', \'xrName\', \'xrNamespace\']\n' +
        '    apiVersion: {API_VERSION}\n' +
        '    kind: {KIND}\n' +
        '    clusters: ${{ parameters.clusters if parameters.manifestLayout === \'cluster-scoped\' and parameters.pushToGit else [\'temp\'] }}\n' +
        '    removeEmptyParams: true\n' +
        '- id: moveNamespacedManifest\n' +
        '  name: Move and Rename Manifest\n' +
        '  if: ${{ parameters.manifestLayout === \'namespace-scoped\' }}\n' +
        '  action: fs:rename\n' +
        '  input:\n' +
        '    files:\n' +
        '      - from: ${{ steps.generateManifest.output.filePaths[0] }}\n' +
        '        to: "./${{ parameters.xrNamespace }}/${{ steps.generateManifest.input.kind }}/${{ steps.generateManifest.output.filePaths[0].split(\'/\').pop() }}"\n' +
        '- id: moveCustomManifest\n' +
        '  name: Move and Rename Manifest\n' +
        '  if: ${{ parameters.manifestLayout === \'custom\' }}\n' +
        '  action: fs:rename\n' +
        '  input:\n' +
        '    files:\n' +
        '      - from: ${{ steps.generateManifest.output.filePaths[0] }}\n' +
        '        to: "./${{ parameters.basePath }}/${{ parameters.xrName }}.yaml"'; // <-- removed trailing newline
    }
    const publishPhaseTarget = this.config.getOptionalString('kubernetesIngestor.crossplane.xrds.publishPhase.target')?.toLowerCase();
    let action = '';
    switch (publishPhaseTarget) {
      case 'gitlab':
        action = 'publish:gitlab:merge-request';
        break;
      case 'bitbucket':
        action = 'publish:bitbucketServer:pull-request';
        break;
      case 'bitbucketcloud':
        action = 'publish:bitbucketCloud:pull-request';
        break;
      case 'github':
      default:
        action = 'publish:github:pull-request';
        break;
    }
    const repoSelectionStepsYaml = `
- id: create-pull-request
  name: create-pull-request
  action: ${action}
  if: \${{ parameters.pushToGit }}
  input:
    repoUrl: \${{ parameters.repoUrl }}
    branchName: create-\${{ parameters.xrName }}-resource
    title: Create {KIND} Resource \${{ parameters.xrName }}
    description: Create {KIND} Resource \${{ parameters.xrName }}
    targetBranchName: \${{ parameters.targetBranch }}
  `;

    let defaultStepsYaml = baseStepsYaml;

    if (publishPhaseTarget !== 'yaml') {
      if (this.config.getOptionalBoolean('kubernetesIngestor.crossplane.xrds.publishPhase.allowRepoSelection')) {
        defaultStepsYaml += repoSelectionStepsYaml;
      }
      else {
        const repoHardcodedStepsYaml = `
- id: create-pull-request
  name: create-pull-request
  action: ${action}
  if: \${{ parameters.pushToGit }}
  input:
    repoUrl: ${this.config.getOptionalString('kubernetesIngestor.crossplane.xrds.publishPhase.git.repoUrl')}
    branchName: create-\${{ parameters.xrName }}-resource
    title: Create {KIND} Resource \${{ parameters.xrName }}
    description: Create {KIND} Resource \${{ parameters.xrName }}
    targetBranchName: ${this.config.getOptionalString('kubernetesIngestor.crossplane.xrds.publishPhase.git.targetBranch')}
      `;
        defaultStepsYaml += repoHardcodedStepsYaml;
      }
    }

    // Replace placeholders in the default steps YAML with XRD details
    const apiVersion = `${xrd.spec.group}/${version.name}`;
    const kind = (!isV2 || isLegacyCluster)
      ? xrd.spec.claimNames?.kind
      : xrd.spec.names?.kind;

    const populatedStepsYaml = defaultStepsYaml
      .replaceAll('{API_VERSION}', apiVersion)
      .replaceAll('{KIND}', kind);

    // Parse the populated default steps YAML string
    const defaultSteps = yaml.load(populatedStepsYaml) as any[];

    // Retrieve additional steps from the version if defined
    const additionalStepsYamlString = version.schema?.openAPIV3Schema?.properties?.steps?.default;
    const additionalSteps = additionalStepsYamlString
      ? yaml.load(additionalStepsYamlString) as any[]
      : [];

    // Combine default steps with any additional steps
    return [...defaultSteps, ...additionalSteps];
  }

  private getPullRequestUrl(): string {
    const publishPhaseTarget = this.config.getOptionalString('kubernetesIngestor.crossplane.xrds.publishPhase.target')?.toLowerCase();

    switch (publishPhaseTarget) {
      case 'gitlab':
        return '${{ steps["create-pull-request"].output.mergeRequestUrl }}';
      case 'bitbucket':
      case 'bitbucketcloud':
        return '${{ steps["create-pull-request"].output.pullRequestUrl }}';
      case 'github':
      default:
        return '${{ steps["create-pull-request"].output.remoteUrl }}';
    }
  }

  private translateCRDToTemplate(crd: any): Entity[] {
    if (!crd?.metadata || !crd?.spec?.versions) {
      throw new Error('Invalid CRD object');
    }

    const clusters = crd.clusters || ["default"];

    // Find the stored version
    const storedVersion = crd.spec.versions.find((version: any) => version.storage === true);
    if (!storedVersion) {
      this.logger.warn(`No stored version found for CRD ${crd.metadata.name}, skipping template generation`);
      return [];
    }

    const parameters = this.extractCRDParameters(storedVersion, clusters, crd);
    const steps = this.extractCRDSteps(storedVersion, crd);
    const clusterTags = clusters.map((cluster: any) => `cluster:${cluster}`);
    const tags = ['kubernetes-crd', ...clusterTags];

    const templates = [{
      apiVersion: 'scaffolder.backstage.io/v1beta3',
      kind: 'Template',
      metadata: {
        name: `${crd.spec.names.singular}-${storedVersion.name}`,
        title: `${crd.spec.names.kind}`,
        description: `A template to create a ${crd.spec.names.kind} instance`,
        tags: tags,
        labels: {
          forEntity: "system",
          source: "kubernetes",
        },
        annotations: {
          'backstage.io/managed-by-location': `cluster origin: ${crd.clusterName}`,
          'backstage.io/managed-by-origin-location': `cluster origin: ${crd.clusterName}`,
        },
      },
      spec: {
        type: crd.spec.names.singular,
        parameters,
        steps,
        output: {
          links: [
            {
              title: 'Download YAML Manifest',
              url: 'data:application/yaml;charset=utf-8,${{ steps.generateManifest.output.manifest }}'
            },
            {
              title: 'Open Pull Request',
              if: '${{ parameters.pushToGit }}',
              url: this.getCRDPullRequestUrl()
            }
          ]
        },
      },
    }];

    // Filter out invalid templates
    return templates.filter(template => this.validateEntityName(template));
  }

  private translateCRDVersionsToAPI(crd: any): Entity[] {
    if (!crd?.metadata || !crd?.spec?.versions) {
      throw new Error('Invalid CRD object');
    }

    const apis = crd.spec.versions.map((version: any = {}) => {
      let crdOpenAPIDoc: any = {};
      crdOpenAPIDoc.openapi = "3.0.0";
      crdOpenAPIDoc.info = {
        title: `${crd.spec.names.plural}.${crd.spec.group}`,
        version: version.name,
      };
      crdOpenAPIDoc.servers = crd.clusterDetails.map((cluster: any) => ({
        url: cluster.url,
        description: cluster.name,
      }));
      crdOpenAPIDoc.tags = [
        {
          name: "Cluster Scoped Operations",
          description: "Operations on the cluster level"
        },
        {
          name: "Namespace Scoped Operations",
          description: "Operations on the namespace level"
        },
        {
          name: "Specific Object Scoped Operations",
          description: "Operations on a specific resource"
        }
      ]
      // TODO(vrabbi) Add Paths To API for XRD
      if (crd.spec.scope === "Cluster") {
        crdOpenAPIDoc.paths = {
          [`/apis/${crd.spec.group}/${version.name}/${crd.spec.names.plural}`]: {
            get: {
              tags: ["Cluster Scoped Operations"],
              summary: `List all ${crd.spec.names.plural} in all namespaces`,
              operationId: `list${crd.spec.names.plural}AllNamespaces`,
              responses: {
                "200": {
                  description: `List of ${crd.spec.names.plural} in all namespaces`,
                  content: {
                    "application/json": {
                      schema: {
                        type: "array",
                        items: {
                          $ref: `#/components/schemas/Resource`
                        }
                      }
                    }
                  }
                }
              }
            },
            post: {
              tags: ["Cluster Scoped Operations"],
              summary: "Create a resource",
              operationId: "createResource",
              parameters: [],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      $ref: `#/components/schemas/Resource`
                    }
                  },
                },
              },
              responses: {
                "201": { description: "Resource created" },
              },
            },
          },
          [`/apis/${crd.spec.group}/${version.name}/${crd.spec.names.plural}/{name}`]: {
            get: {
              tags: ["Specific Object Scoped Operations"],
              summary: `Get a ${crd.spec.names.kind}`,
              operationId: `get${crd.spec.names.kind}`,
              parameters: [
                { name: "name", in: "path", required: true, schema: { type: "string" } },
              ],
              responses: {
                "200": {
                  description: "Resource details",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        $ref: `#/components/schemas/Resource`
                      },
                    },
                  },
                },
              },
            },
            put: {
              tags: ["Specific Object Scoped Operations"],
              summary: "Update a resource",
              operationId: "updateResource",
              parameters: [
                { name: "name", in: "path", required: true, schema: { type: "string" } },
              ],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      $ref: `#/components/schemas/Resource`
                    },
                  },
                },
              },
              responses: {
                "200": { description: "Resource updated" },
              },
            },
            delete: {
              tags: ["Specific Object Scoped Operations"],
              summary: "Delete a resource",
              operationId: "deleteResource",
              parameters: [
                { name: "name", in: "path", required: true, schema: { type: "string" } },
              ],
              responses: {
                "200": { description: "Resource deleted" },
              },
            },
          },
        };
      }
      else {
        crdOpenAPIDoc.paths = {
          [`/apis/${crd.spec.group}/${version.name}/${crd.spec.names.plural}`]: {
            get: {
              tags: ["Cluster Scoped Operations"],
              summary: `List all ${crd.spec.names.plural} in all namespaces`,
              operationId: `list${crd.spec.names.plural}AllNamespaces`,
              responses: {
                "200": {
                  description: `List of ${crd.spec.names.plural} in all namespaces`,
                  content: {
                    "application/json": {
                      schema: {
                        type: "array",
                        items: {
                          $ref: `#/components/schemas/Resource`
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          [`/apis/${crd.spec.group}/${version.name}/namespaces/{namespace}/${crd.spec.names.plural}`]: {
            get: {
              tags: ["Namespace Scoped Operations"],
              summary: `List all ${crd.spec.names.plural} in a namespace`,
              operationId: `list${crd.spec.names.plural}`,
              parameters: [
                {
                  name: "namespace",
                  in: "path",
                  required: true,
                  schema: {
                    type: "string"
                  }
                }
              ],
              responses: {
                "200": {
                  description: `List of ${crd.spec.names.plural}`,
                  content: {
                    "application/json": {
                      schema: {
                        type: "array",
                        items: {
                          $ref: `#/components/schemas/Resource`
                        }
                      }
                    }
                  }
                }
              }
            },
            post: {
              tags: ["Namespace Scoped Operations"],
              summary: "Create a resource",
              operationId: "createResource",
              parameters: [
                { name: "namespace", in: "path", required: true, schema: { type: "string" } },
              ],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      $ref: `#/components/schemas/Resource`
                    }
                  },
                },
              },
              responses: {
                "201": { description: "Resource created" },
              },
            },
          },
          [`/apis/${crd.spec.group}/${version.name}/namespaces/{namespace}/${crd.spec.names.plural}/{name}`]: {
            get: {
              tags: ["Specific Object Scoped Operations"],
              summary: `Get a ${crd.spec.names.kind}`,
              operationId: `get${crd.spec.names.kind}`,
              parameters: [
                { name: "namespace", in: "path", required: true, schema: { type: "string" } },
                { name: "name", in: "path", required: true, schema: { type: "string" } },
              ],
              responses: {
                "200": {
                  description: "Resource details",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        $ref: `#/components/schemas/Resource`
                      },
                    },
                  },
                },
              },
            },
            put: {
              tags: ["Specific Object Scoped Operations"],
              summary: "Update a resource",
              operationId: "updateResource",
              parameters: [
                { name: "namespace", in: "path", required: true, schema: { type: "string" } },
                { name: "name", in: "path", required: true, schema: { type: "string" } },
              ],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      $ref: `#/components/schemas/Resource`
                    },
                  },
                },
              },
              responses: {
                "200": { description: "Resource updated" },
              },
            },
            delete: {
              tags: ["Specific Object Scoped Operations"],
              summary: "Delete a resource",
              operationId: "deleteResource",
              parameters: [
                { name: "namespace", in: "path", required: true, schema: { type: "string" } },
                { name: "name", in: "path", required: true, schema: { type: "string" } },
              ],
              responses: {
                "200": { description: "Resource deleted" },
              },
            },
          },
        };
      }
      crdOpenAPIDoc.components = {
        schemas: {
          Resource: {
            type: "object",
            properties: version.schema.openAPIV3Schema.properties
          }
        },
        securitySchemes: {
          bearerHttpAuthentication: {
            description: "Bearer token using a JWT",
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT"
          }
        }
      };
      crdOpenAPIDoc.security = [
        {
          bearerHttpAuthentication: []
        }
      ]
      return {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'API',
        metadata: {
          name: `${crd.spec.names.kind.toLowerCase()}-${crd.spec.group}--${version.name}`,
          title: `${crd.spec.names.kind.toLowerCase()}-${crd.spec.group}--${version.name}`,
          annotations: {
            'backstage.io/managed-by-location': `cluster origin: ${crd.clusterName}`,
            'backstage.io/managed-by-origin-location': `cluster origin: ${crd.clusterName}`,
          },
        },
        spec: {
          type: "openapi",
          lifecycle: "production",
          owner: "kubernetes-auto-ingested",
          system: "kubernets-auto-ingested",
          definition: yaml.dump(crdOpenAPIDoc),
        },
      };
    }
    );

    // Filter out invalid APIs
    return apis.filter((api: Entity) => this.validateEntityName(api));
  }

  private extractCRDParameters(version: any, clusters: string[], crd: any): any[] {
    const mainParameterGroup = {
      title: 'Resource Metadata',
      required: ['name'],
      properties: {
        name: {
          title: 'Name',
          description: 'The name of the resource',
          pattern: "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$",
          maxLength: 63,
          type: 'string',
        },
        ...(crd.spec.scope === 'Namespaced' ? {
          namespace: {
            title: 'Namespace',
            description: 'The namespace in which to create the resource',
            pattern: "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$",
            maxLength: 63,
            type: 'string',
          }
        } : {}),
        owner: {
          title: 'Owner',
          description: 'The owner of the resource',
          type: 'string',
          'ui:field': 'OwnerPicker',
          'ui:options': {
            'catalogFilter': {
              'kind': 'Group',
            },
          },
        }
      },
      type: 'object',
    };

    const processProperties = (properties: Record<string, any>): Record<string, any> => {
      const processedProperties: Record<string, any> = {};

      for (const [key, value] of Object.entries(properties)) {
        const typedValue = value as Record<string, any>;

        // Handle fields with x-kubernetes-preserve-unknown-fields: true
        if (typedValue['x-kubernetes-preserve-unknown-fields'] === true && !typedValue.type) {
          const { required: _, ...restValue } = typedValue;
          processedProperties[key] = {
            ...restValue,
            type: 'string',
            'ui:widget': 'textarea',
            'ui:options': {
              rows: 10,
            },
          };
        } else if (typedValue.type === 'object' && typedValue.properties) {
          const subProperties = processProperties(typedValue.properties);
          // Remove required fields for nested objects
          const { required: _, ...restValue } = typedValue;
          processedProperties[key] = { ...restValue, properties: subProperties };
        } else {
          // Remove required field if present
          const { required: _, ...restValue } = typedValue;
          processedProperties[key] = restValue;
        }
      }

      return processedProperties;
    };

    const processedSpec = version.schema?.openAPIV3Schema?.properties?.spec
      ? processProperties(version.schema.openAPIV3Schema.properties.spec.properties)
      : {};

    const specParameters = {
      title: 'Resource Spec',
      properties: processedSpec,
      type: 'object',
    };

    const publishPhaseTarget = this.config.getOptionalString('kubernetesIngestor.genericCRDTemplates.publishPhase.target')?.toLowerCase();
    const allowedTargets = this.config.getOptionalStringArray('kubernetesIngestor.genericCRDTemplates.publishPhase.allowedTargets');

    let allowedHosts: string[] = [];
    if (allowedTargets) {
      allowedHosts = allowedTargets;
    } else {
      switch (publishPhaseTarget) {
        case 'github':
          allowedHosts = ['github.com'];
          break;
        case 'gitlab':
          allowedHosts = ['gitlab.com'];
          break;
        case 'bitbucket':
          allowedHosts = ['only-bitbucket-server-is-allowed'];
          break;
        case 'bitbucketcloud':
          allowedHosts = ['bitbucket.org'];
          break;
        default:
          allowedHosts = [];
      }
    }

    const publishParameters = this.config.getOptionalBoolean('kubernetesIngestor.genericCRDTemplates.publishPhase.allowRepoSelection')
      ? {
        title: "Creation Settings",
        properties: {
          pushToGit: {
            title: "Push Manifest to GitOps Repository",
            type: "boolean",
            default: true
          }
        },
        dependencies: {
          pushToGit: {
            oneOf: [
              {
                properties: {
                  pushToGit: { enum: [false] }
                }
              },
              {
                properties: {
                  pushToGit: { enum: [true] },
                  repoUrl: {
                    content: { type: "string" },
                    description: "Name of repository",
                    "ui:field": "RepoUrlPicker",
                    "ui:options": {
                      allowedHosts: allowedHosts
                    }
                  },
                  targetBranch: {
                    type: "string",
                    description: "Target Branch for the PR",
                    default: "main"
                  },
                  manifestLayout: {
                    type: "string",
                    description: "Layout of the manifest",
                    default: "cluster-scoped",
                    "ui:help": "Choose how the manifest should be generated in the repo.\n* Cluster-scoped - a manifest is created for each selected cluster under the root directory of the clusters name\n* namespace-scoped - a manifest is created for the resource under the root directory with the namespace name\n* custom - a manifest is created under the specified base path",
                    enum: ["cluster-scoped", "namespace-scoped", "custom"]
                  }
                },
                dependencies: {
                  manifestLayout: {
                    oneOf: [
                      {
                        properties: {
                          manifestLayout: { enum: ["cluster-scoped"] },
                          clusters: {
                            title: "Target Clusters",
                            description: "The target clusters to apply the resource to",
                            type: "array",
                            minItems: 1,
                            items: {
                              enum: clusters,
                              type: 'string',
                            },
                            uniqueItems: true,
                            'ui:widget': 'checkboxes',
                          },
                        },
                        required: ["clusters"]
                      },
                      {
                        properties: {
                          manifestLayout: { enum: ["custom"] },
                          basePath: {
                            type: "string",
                            description: "Base path in GitOps repository to push the manifest to"
                          }
                        },
                        required: ["basePath"]
                      },
                      {
                        properties: {
                          manifestLayout: { enum: ["namespace-scoped"] }
                        }
                      }
                    ]
                  }
                }
              }
            ]
          }
        }
      }
      : {
        title: "Creation Settings",
        properties: {
          pushToGit: {
            title: "Push Manifest to GitOps Repository",
            type: "boolean",
            default: true
          }
        },
        dependencies: {
          pushToGit: {
            oneOf: [
              {
                properties: {
                  pushToGit: { enum: [false] }
                }
              },
              {
                properties: {
                  pushToGit: { enum: [true] },
                  manifestLayout: {
                    type: "string",
                    description: "Layout of the manifest",
                    default: "cluster-scoped",
                    "ui:help": "Choose how the manifest should be generated in the repo.\n* Cluster-scoped - a manifest is created for each selected cluster under the root directory of the clusters name\n* namespace-scoped - a manifest is created for the resource under the root directory with the namespace name\n* custom - a manifest is created under the specified base path",
                    enum: ["cluster-scoped", "namespace-scoped", "custom"]
                  }
                },
                dependencies: {
                  manifestLayout: {
                    oneOf: [
                      {
                        properties: {
                          manifestLayout: { enum: ["cluster-scoped"] },
                          clusters: {
                            title: "Target Clusters",
                            description: "The target clusters to apply the resource to",
                            type: "array",
                            minItems: 1,
                            items: {
                              enum: clusters,
                              type: 'string',
                            },
                            uniqueItems: true,
                            'ui:widget': 'checkboxes',
                          },
                        },
                        required: ["clusters"]
                      },
                      {
                        properties: {
                          manifestLayout: { enum: ["custom"] },
                          basePath: {
                            type: "string",
                            description: "Base path in GitOps repository to push the manifest to"
                          }
                        },
                        required: ["basePath"]
                      },
                      {
                        properties: {
                          manifestLayout: { enum: ["namespace-scoped"] }
                        }
                      }
                    ]
                  }
                }
              }
            ]
          }
        }
      };

    return [mainParameterGroup, specParameters, publishParameters];
  }

  private extractCRDSteps(version: any, crd: any): any[] {
    let baseStepsYaml =
      '- id: generateManifest\n' +
      '  name: Generate Kubernetes Resource Manifest\n' +
      '  action: terasky:crd-template\n' +
      '  input:\n' +
      '    parameters: ${{ parameters }}\n' +
      '    nameParam: name\n' +
      (crd.spec.scope === 'Namespaced' ? '    namespaceParam: namespace\n' : '    namespaceParam: ""\n') +
      '    excludeParams: [\'compositionSelectionStrategy\',\'pushToGit\',\'basePath\',\'manifestLayout\',\'_editData\', \'targetBranch\', \'repoUrl\', \'clusters\', \'name\', \'namespace\', \'owner\']\n' +
      `    apiVersion: ${crd.spec.group}/${version.name}\n` +
      `    kind: ${crd.spec.names.kind}\n` +
      '    clusters: ${{ parameters.clusters if parameters.manifestLayout === \'cluster-scoped\' and parameters.pushToGit else [\'temp\'] }}\n' +
      '    removeEmptyParams: true\n';
    if (crd.spec.scope === 'Namespaced') {
      baseStepsYaml +=
        '- id: moveNamespacedManifest\n' +
        '  name: Move and Rename Manifest\n' +
        '  if: ${{ parameters.manifestLayout === \'namespace-scoped\' }}\n' +
        '  action: fs:rename\n' +
        '  input:\n' +
        '    files:\n' +
        '      - from: ${{ steps.generateManifest.output.filePaths[0] }}\n' +
        '        to: "./${{ parameters.namespace }}/${{ steps.generateManifest.input.kind }}/${{ steps.generateManifest.output.filePaths[0].split(\'/\').pop() }}"\n';
    }
    baseStepsYaml +=
      '- id: moveCustomManifest\n' +
      '  name: Move and Rename Manifest\n' +
      '  if: ${{ parameters.manifestLayout === \'custom\' }}\n' +
      '  action: fs:rename\n' +
      '  input:\n' +
      '    files:\n' +
      '      - from: ${{ steps.generateManifest.output.filePaths[0] }}\n' +
      '        to: "./${{ parameters.basePath }}/${{ parameters.name }}.yaml"\n'; // <-- removed trailing newline

    const publishPhaseTarget = this.config.getOptionalString('kubernetesIngestor.genericCRDTemplates.publishPhase.target')?.toLowerCase();
    let action = '';
    switch (publishPhaseTarget) {
      case 'gitlab':
        action = 'publish:gitlab:merge-request';
        break;
      case 'bitbucket':
        action = 'publish:bitbucketServer:pull-request';
        break;
      case 'bitbucketcloud':
        action = 'publish:bitbucketCloud:pull-request';
        break;
      case 'github':
      default:
        action = 'publish:github:pull-request';
        break;
    }

    let defaultStepsYaml = baseStepsYaml;

    if (publishPhaseTarget !== 'yaml') {
      if (this.config.getOptionalBoolean('kubernetesIngestor.genericCRDTemplates.publishPhase.allowRepoSelection')) {
        defaultStepsYaml +=
          '- id: create-pull-request\n' +
          '  name: create-pull-request\n' +
          `  action: ${action}\n` +
          '  if: ${{ parameters.pushToGit }}\n' +
          '  input:\n' +
          '    repoUrl: ${{ parameters.repoUrl }}\n' +
          '    branchName: create-${{ parameters.name }}-resource\n' +
          `    title: Create ${crd.spec.names.kind} Resource \${{ parameters.name }}\n` +
          `    description: Create ${crd.spec.names.kind} Resource \${{ parameters.name }}\n` +
          '    targetBranchName: ${{ parameters.targetBranch }}\n';
      } else {
        defaultStepsYaml +=
          '- id: create-pull-request\n' +
          '  name: create-pull-request\n' +
          `  action: ${action}\n` +
          '  if: ${{ parameters.pushToGit }}\n' +
          '  input:\n' +
          `    repoUrl: ${this.config.getOptionalString('kubernetesIngestor.genericCRDTemplates.publishPhase.git.repoUrl')}\n` +
          '    branchName: create-${{ parameters.name }}-resource\n' +
          `    title: Create ${crd.spec.names.kind} Resource \${{ parameters.name }}\n` +
          `    description: Create ${crd.spec.names.kind} Resource \${{ parameters.name }}\n` +
          `    targetBranchName: ${this.config.getOptionalString('kubernetesIngestor.genericCRDTemplates.publishPhase.git.targetBranch')}\n`;
      }
    }
    return yaml.load(defaultStepsYaml) as any[];
  }

  private getCRDPullRequestUrl(): string {
    const publishPhaseTarget = this.config.getOptionalString('kubernetesIngestor.genericCRDTemplates.publishPhase.target')?.toLowerCase();

    switch (publishPhaseTarget) {
      case 'gitlab':
        return '${{ steps["create-pull-request"].output.mergeRequestUrl }}';
      case 'bitbucket':
      case 'bitbucketcloud':
        return '${{ steps["create-pull-request"].output.pullRequestUrl }}';
      case 'github':
      default:
        return '${{ steps["create-pull-request"].output.remoteUrl }}';
    }
  }
}