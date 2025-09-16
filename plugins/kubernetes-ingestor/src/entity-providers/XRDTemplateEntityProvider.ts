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
import { CrossplaneVersionHandler } from '../version-handlers/CrossplaneVersionHandler';
import { CRDScopeHandler } from '../version-handlers/CRDScopeHandler';
import { StepsYamlBuilder } from '../yaml-builders/StepsYamlBuilder';
import { OpenAPIDocBuilder } from '../yaml-builders/OpenAPIDocBuilder';

export class XRDTemplateEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;
  private readonly stepsYamlBuilder: StepsYamlBuilder;
  private readonly openAPIDocBuilder: OpenAPIDocBuilder;

  constructor(
    private readonly taskRunner: SchedulerServiceTaskRunner,
    logger: LoggerService,
    private readonly config: Config,
    private readonly resourceFetcher: DefaultKubernetesResourceFetcher,
  ) {
    this.stepsYamlBuilder = new StepsYamlBuilder(this.config);
    this.openAPIDocBuilder = new OpenAPIDocBuilder();
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
    const isDirectXR = CrossplaneVersionHandler.isDirectXR(xrd);
    const clusters = xrd.clusters || ["kubetopus"];
    const templates = xrd.spec.versions.map((version: { name: any }) => {
      // For v2 Cluster/Namespaced, do not generate claim-based templates
      if (isDirectXR) {
        // No claimNames, use spec.name as resource type
        const parameters = this.extractParameters(version, clusters, xrd);
        const prefix = this.getAnnotationPrefix();
        const steps = this.extractSteps(version, xrd);
        const clusterTags = clusters.map((cluster: any) => `cluster:${cluster}`);
        const tags = ['crossplane', ...clusterTags];
        const crossplaneAnnotations = CrossplaneVersionHandler.getCrossplaneAnnotations(xrd, prefix);
        return {
          apiVersion: 'scaffolder.backstage.io/v1beta3',
          kind: 'Template',
          metadata: {
            name: `${xrd.metadata.name}-${version.name}`,
            title: `${CrossplaneVersionHandler.getResourceKind(xrd)}`,
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
      const crossplaneAnnotations = CrossplaneVersionHandler.getCrossplaneAnnotations(xrd, prefix);
      return {
        apiVersion: 'scaffolder.backstage.io/v1beta3',
        kind: 'Template',
        metadata: {
          name: `${xrd.metadata.name}-${version.name}`,
          title: `${CrossplaneVersionHandler.getResourceKind(xrd)}`,
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

    // Prefer spec.names.plural/kind if available, fallback to metadata.name
    const resourceKind = CrossplaneVersionHandler.getResourceKind(xrd);

    const apis = xrd.spec.versions.map((version: any = {}) => {
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
          definition: this.openAPIDocBuilder.buildXRDOpenAPIDoc(version, xrd),
        },
      };
    });

    // Filter out invalid APIs
    return apis.filter((api: Entity) => this.validateEntityName(api));
  }

  private extractParameters(version: any, clusters: string[], xrd: any): any[] {
    const shouldIncludeNamespace = CrossplaneVersionHandler.shouldIncludeNamespace(xrd);
    const isDirectXR = CrossplaneVersionHandler.isDirectXR(xrd);
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
    if (shouldIncludeNamespace) {
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
    if (isDirectXR) {
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
    return this.stepsYamlBuilder.buildXRDSteps(version, xrd);
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
          definition: this.openAPIDocBuilder.buildCRDOpenAPIDoc(version, crd),
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
        ...CRDScopeHandler.getNamespaceMetadata(crd),
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
    return this.stepsYamlBuilder.buildCRDSteps(version, crd);
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