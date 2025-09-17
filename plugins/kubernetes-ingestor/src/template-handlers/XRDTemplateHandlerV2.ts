import { Entity } from '@backstage/catalog-model';
import { Config } from '@backstage/config';
import { TemplateEntityBuilder } from '../entity-builders';
import { StepsYamlBuilder } from '../yaml-builders';
import { CrossplaneVersionHandler } from '../version-handlers/CrossplaneVersionHandler';

/**
 * Handles XRD template generation for Crossplane v2
 */
export class XRDTemplateHandlerV2 {
  private readonly stepsYamlBuilder: StepsYamlBuilder;

  constructor(
    private readonly config: Config
  ) {
    this.stepsYamlBuilder = new StepsYamlBuilder(config);
  }

  /**
   * Generates template entities for v2 XRD
   * v2 supports LegacyCluster (uses claims), Cluster (direct XR), and Namespaced (direct XR)
   */
  generateTemplates(xrd: any, version: any, clusters: string[]): Entity {
    const parameters = this.extractParameters(version, clusters, xrd);
    const steps = this.stepsYamlBuilder.buildXRDSteps(version, xrd);
    const prefix = this.getAnnotationPrefix();
    const clusterTags = clusters.map((cluster: any) => `cluster:${cluster}`);
    const scope = CrossplaneVersionHandler.getScope(xrd);
    const isLegacyCluster = CrossplaneVersionHandler.isLegacyCluster(xrd);
    const isDirectXR = CrossplaneVersionHandler.isDirectXR(xrd);

    const builder = new TemplateEntityBuilder();

    // Determine the title based on scope and whether claims are used
    let title: string;
    if (isLegacyCluster) {
      title = `${xrd.spec.claimNames?.kind}`;
    } else {
      title = `${xrd.spec.names?.kind}`;
    }

    return builder
      .withCrossplaneMetadata(xrd.metadata.name, version.name, xrd.clusterName)
      .withTitle(title)
      .withType(xrd.metadata.name)
      .withCrossplaneLabels()
      .withTags(['crossplane', 'v2', ...clusterTags])
      .withAnnotations({
        [`${prefix}/crossplane-claim`]: isLegacyCluster ? 'true' : 'false',
        [`${prefix}/crossplane-version`]: 'v2',
        [`${prefix}/crossplane-scope`]: scope,
        [`${prefix}/crossplane-direct-xr`]: isDirectXR ? 'true' : 'false',
      })
      .withParameters(parameters)
      .withSteps(steps)
      .withStandardOutputLinks(this.getPullRequestUrl())
      .build();
  }

  /**
   * Extracts parameters for v2 XRD based on scope
   */
  private extractParameters(version: any, clusters: string[], xrd: any): any[] {
    const isLegacyCluster = CrossplaneVersionHandler.isLegacyCluster(xrd);
    const isNamespaced = CrossplaneVersionHandler.isNamespaced(xrd);
    const includeNamespace = CrossplaneVersionHandler.shouldIncludeNamespace(xrd);

    // Main parameter group - namespace inclusion depends on scope
    const mainParameterGroup = this.buildMainParameterGroup(includeNamespace);
    const specParameters = this.extractSpecParameters(version);
    const crossplaneParameters = this.extractV2CrossplaneParameters(xrd, isLegacyCluster);
    const publishParameters = this.extractPublishParameters(clusters, isNamespaced);

    return [mainParameterGroup, specParameters, crossplaneParameters, publishParameters];
  }

  /**
   * Builds the main parameter group based on v2 scope requirements
   */
  private buildMainParameterGroup(includeNamespace: boolean): any {
    const properties: any = {
      xrName: {
        title: 'Name',
        description: 'The name of the resource',
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
    };

    const required = ['xrName', 'owner'];

    // Add namespace parameter for scopes that require it
    if (includeNamespace) {
      properties.xrNamespace = {
        title: 'Namespace',
        description: 'The namespace in which to create the resource',
        pattern: "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$",
        maxLength: 63,
        type: 'string',
      };
      required.push('xrNamespace');
    }

    return {
      title: 'Resource Metadata',
      required,
      properties,
      type: 'object',
    };
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
   * Extracts v2-specific Crossplane parameters based on scope
   */
  private extractV2CrossplaneParameters(xrd: any, isLegacyCluster: boolean): any {
    const baseProperties: any = {};

    // LegacyCluster scope includes v1-style parameters
    if (isLegacyCluster) {
      baseProperties.writeConnectionSecretToRef = {
        title: 'Crossplane Configuration Details',
        properties: {
          name: {
            title: 'Connection Secret Name',
            type: 'string',
          },
        },
        type: 'object',
      };
      baseProperties.compositeDeletePolicy = {
        title: 'Composite Delete Policy',
        default: 'Background',
        enum: ['Background', 'Foreground'],
        type: 'string',
      };
      baseProperties.compositionUpdatePolicy = {
        title: 'Composition Update Policy',
        enum: ['Automatic', 'Manual'],
        type: 'string',
      };
    }

    // All v2 scopes support composition selection
    baseProperties.compositionSelectionStrategy = {
      title: 'Composition Selection Strategy',
      description: 'How the composition should be selected.',
      enum: this.getCompositionSelectionOptions(xrd),
      default: 'runtime',
      type: 'string',
    };

    return {
      title: 'Crossplane Settings',
      properties: baseProperties,
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
   * Extracts publish parameters with v2-specific adaptations
   */
  private extractPublishParameters(clusters: string[], isNamespaced: boolean): any {
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
        default: isNamespaced ? 'namespace-scoped' : 'cluster-scoped',
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