import { Entity } from '@backstage/catalog-model';
import { Config } from '@backstage/config';
import { TemplateEntityBuilder } from '../entity-builders';
import { StepsYamlBuilder } from '../yaml-builders';

/**
 * Handles XRD template generation for Crossplane v1
 */
export class XRDTemplateHandlerV1 {
  private readonly stepsYamlBuilder: StepsYamlBuilder;

  constructor(
    private readonly config: Config
  ) {
    this.stepsYamlBuilder = new StepsYamlBuilder(config);
  }

  /**
   * Generates template entities for v1 XRD
   * v1 always uses claims
   */
  generateTemplates(xrd: any, version: any, clusters: string[]): Entity {
    const parameters = this.extractParameters(version, clusters, xrd);
    const steps = this.stepsYamlBuilder.buildXRDSteps(version, xrd);
    const prefix = this.getAnnotationPrefix();
    const clusterTags = clusters.map((cluster: any) => `cluster:${cluster}`);

    const builder = new TemplateEntityBuilder();

    return builder
      .withCrossplaneMetadata(xrd.metadata.name, version.name, xrd.clusterName)
      .withTitle(`${xrd.spec.claimNames?.kind}`)
      .withType(xrd.metadata.name)
      .withCrossplaneLabels()
      .withTags(['crossplane', ...clusterTags])
      .withAnnotations({
        [`${prefix}/crossplane-claim`]: 'true',
        [`${prefix}/crossplane-version`]: 'v1',
        [`${prefix}/crossplane-scope`]: 'Cluster',
      })
      .withParameters(parameters)
      .withSteps(steps)
      .withStandardOutputLinks(this.getPullRequestUrl())
      .build();
  }

  /**
   * Extracts parameters for v1 XRD
   */
  private extractParameters(version: any, clusters: string[], xrd: any): any[] {
    // Main parameter group - v1 always includes namespace
    const mainParameterGroup = {
      title: 'Resource Metadata',
      required: ['xrName', 'xrNamespace', 'owner'],
      properties: {
        xrName: {
          title: 'Name',
          description: 'The name of the resource',
          pattern: "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$",
          maxLength: 63,
          type: 'string',
        },
        xrNamespace: {
          title: 'Namespace',
          description: 'The namespace in which to create the resource',
          pattern: "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$",
          maxLength: 63,
          type: 'string',
        },
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

    const specParameters = this.extractSpecParameters(version);
    const crossplaneParameters = this.extractV1CrossplaneParameters(xrd);
    const publishParameters = this.extractPublishParameters(clusters);

    return [mainParameterGroup, specParameters, crossplaneParameters, publishParameters];
  }

  /**
   * Extracts spec parameters from version schema
   */
  private extractSpecParameters(version: any): any {
    const convertDefaultValuesToPlaceholders = this.config.getOptionalBoolean(
      'kubernetesIngestor.crossplane.xrds.convertDefaultValuesToPlaceholders'
    );

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

          // Handle conditional fields
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

    return {
      title: 'Resource Spec',
      properties: processedSpec,
      type: 'object',
    };
  }

  /**
   * Extracts v1-specific Crossplane parameters
   */
  private extractV1CrossplaneParameters(xrd: any): any {
    return {
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
          enum: this.getCompositionSelectionOptions(xrd),
          default: 'runtime',
          type: 'string',
        },
      },
      dependencies: this.buildCompositionDependencies(xrd),
      type: 'object',
    };
  }

  /**
   * Gets composition selection options
   */
  private getCompositionSelectionOptions(xrd: any): string[] {
    const options = ['runtime'];
    if (xrd.compositions && xrd.compositions.length > 0) {
      options.push('direct-reference');
    }
    options.push('label-selector');
    return options;
  }

  /**
   * Builds composition dependencies for conditional fields
   */
  private buildCompositionDependencies(xrd: any): any {
    const dependencies: any[] = [
      {
        properties: {
          compositionSelectionStrategy: { enum: ['runtime'] },
        },
      },
    ];

    if (xrd.compositions && xrd.compositions.length > 0) {
      dependencies.push({
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
      });
    }

    dependencies.push({
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
    });

    return {
      compositionSelectionStrategy: {
        oneOf: dependencies,
      },
    };
  }

  /**
   * Extracts publish parameters
   */
  private extractPublishParameters(clusters: string[]): any {
    // getAllowedHosts method handles publishPhaseTarget internally

    const allowedHosts = this.getAllowedHosts();
    const allowRepoSelection = this.config.getOptionalBoolean(
      'kubernetesIngestor.crossplane.xrds.publishPhase.allowRepoSelection'
    );

    const baseProperties: any = {
      pushToGit: {
        title: 'Push Manifest to GitOps Repository',
        type: 'boolean',
        default: true,
      },
    };

    const gitProperties: any = {
      pushToGit: { enum: [true] },
      manifestLayout: {
        type: 'string',
        description: 'Layout of the manifest',
        default: 'cluster-scoped',
        'ui:help': 'Choose how the manifest should be generated in the repo.\n* Cluster-scoped - a manifest is created for each selected cluster under the root directory of the clusters name\n* namespace-scoped - a manifest is created for the resource under the root directory with the namespace name\n* custom - a manifest is created under the specified base path',
        enum: ['cluster-scoped', 'namespace-scoped', 'custom'],
      },
    };

    if (allowRepoSelection) {
      gitProperties.repoUrl = {
        content: { type: 'string' },
        description: 'Name of repository',
        'ui:field': 'RepoUrlPicker',
        'ui:options': {
          allowedHosts: allowedHosts,
        },
      };
      gitProperties.targetBranch = {
        type: 'string',
        description: 'Target Branch for the PR',
        default: 'main',
      };
    }

    return {
      title: 'Creation Settings',
      properties: baseProperties,
      dependencies: {
        pushToGit: {
          oneOf: [
            {
              properties: {
                pushToGit: { enum: [false] },
              },
            },
            {
              properties: gitProperties,
              dependencies: this.buildManifestLayoutDependencies(clusters),
            },
          ],
        },
      },
    };
  }

  /**
   * Builds manifest layout dependencies
   */
  private buildManifestLayoutDependencies(clusters: string[]): any {
    return {
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
    };
  }

  private getAnnotationPrefix(): string {
    return this.config.getOptionalString('kubernetesIngestor.annotationPrefix') || 'terasky.backstage.io';
  }

  private getAllowedHosts(): string[] {
    const publishPhaseTarget = this.config.getOptionalString(
      'kubernetesIngestor.crossplane.xrds.publishPhase.target'
    )?.toLowerCase();

    const allowedTargets = this.config.getOptionalStringArray(
      'kubernetesIngestor.crossplane.xrds.publishPhase.allowedTargets'
    );

    if (allowedTargets) {
      return allowedTargets;
    }

    switch (publishPhaseTarget) {
      case 'github':
        return ['github.com'];
      case 'gitlab':
        return ['gitlab.com'];
      case 'bitbucket':
        return ['only-bitbucket-server-is-allowed'];
      case 'bitbucketcloud':
        return ['bitbucket.org'];
      default:
        return [];
    }
  }

  private getPullRequestUrl(): string {
    const publishPhaseTarget = this.config.getOptionalString(
      'kubernetesIngestor.crossplane.xrds.publishPhase.target'
    )?.toLowerCase();

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