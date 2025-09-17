import { Entity } from '@backstage/catalog-model';

/**
 * Builder for creating Template entities
 */
export class TemplateEntityBuilder {
  private entity: Entity;

  constructor() {
    this.entity = {
      apiVersion: 'scaffolder.backstage.io/v1beta3',
      kind: 'Template',
      metadata: {
        name: '',
        title: '',
        description: '',
        labels: {},
        tags: [],
        annotations: {},
      },
      spec: {
        type: '',
        parameters: [],
        steps: [],
        output: {},
      },
    };
  }

  withName(name: string): this {
    this.entity.metadata.name = name;
    return this;
  }

  withTitle(title: string): this {
    this.entity.metadata.title = title;
    return this;
  }

  withDescription(description: string): this {
    this.entity.metadata.description = description;
    return this;
  }

  withType(type: string): this {
    this.entity.spec!.type = type;
    return this;
  }

  withLabels(labels: Record<string, string>): this {
    this.entity.metadata.labels = labels;
    return this;
  }

  withTags(tags: string[]): this {
    this.entity.metadata.tags = tags;
    return this;
  }

  withAnnotations(annotations: Record<string, string>): this {
    this.entity.metadata.annotations = {
      ...this.entity.metadata.annotations,
      ...annotations,
    };
    return this;
  }

  withParameters(parameters: any[]): this {
    this.entity.spec!.parameters = parameters;
    return this;
  }

  withSteps(steps: any[]): this {
    this.entity.spec!.steps = steps;
    return this;
  }

  withOutput(output: any): this {
    this.entity.spec!.output = output;
    return this;
  }

  withOutputLinks(links: any[]): this {
    const existingOutput = this.entity.spec!.output;
    this.entity.spec!.output = {
      ...(existingOutput && typeof existingOutput === 'object' ? existingOutput : {}),
      links,
    };
    return this;
  }

  /**
   * Adds standard XRD template output links
   */
  withStandardOutputLinks(pullRequestUrl: string): this {
    return this.withOutputLinks([
      {
        title: 'Download YAML Manifest',
        url: 'data:application/yaml;charset=utf-8,${{ steps.generateManifest.output.manifest }}'
      },
      {
        title: 'Open Pull Request',
        if: '${{ parameters.pushToGit }}',
        url: pullRequestUrl
      }
    ]);
  }

  /**
   * Sets standard Crossplane template metadata
   */
  withCrossplaneMetadata(xrdName: string, versionName: string, clusterName: string): this {
    return this
      .withName(`${xrdName}-${versionName}`)
      .withDescription(`A template to create a ${xrdName} instance`)
      .withAnnotations({
        'backstage.io/managed-by-location': `cluster origin: ${clusterName}`,
        'backstage.io/managed-by-origin-location': `cluster origin: ${clusterName}`,
      });
  }

  /**
   * Sets standard labels for Crossplane templates
   */
  withCrossplaneLabels(): this {
    return this.withLabels({
      forEntity: "system",
      source: "crossplane",
    });
  }

  /**
   * Sets standard labels for CRD templates
   */
  withCRDLabels(): this {
    return this.withLabels({
      forEntity: "system",
      source: "kubernetes",
    });
  }

  build(): Entity {
    return this.entity;
  }
}