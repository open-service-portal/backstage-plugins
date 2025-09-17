import { Entity } from '@backstage/catalog-model';

/**
 * Builder for creating API entities
 */
export class APIEntityBuilder {
  private entity: Entity;

  constructor() {
    this.entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'API',
      metadata: {
        name: '',
        title: '',
        annotations: {},
      },
      spec: {
        type: 'openapi',
        lifecycle: 'production',
        owner: 'kubernetes-auto-ingested',
        system: 'kubernets-auto-ingested',
        definition: '',
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

  withAnnotations(annotations: Record<string, string>): this {
    this.entity.metadata.annotations = {
      ...this.entity.metadata.annotations,
      ...annotations,
    };
    return this;
  }

  withDefinition(definition: string): this {
    this.entity.spec!.definition = definition;
    return this;
  }

  withOwner(owner: string): this {
    this.entity.spec!.owner = owner;
    return this;
  }

  withSystem(system: string): this {
    this.entity.spec!.system = system;
    return this;
  }

  withLifecycle(lifecycle: string): this {
    this.entity.spec!.lifecycle = lifecycle;
    return this;
  }

  withType(type: string): this {
    this.entity.spec!.type = type;
    return this;
  }

  /**
   * Sets XRD version-specific metadata and definition
   */
  withXRDVersion(xrd: any, version: any): this {
    const name = `${xrd.spec.names.kind.toLowerCase()}-${xrd.spec.group}--${version.name}`;
    return this
      .withName(name)
      .withTitle(name)
      .withAnnotations({
        'backstage.io/managed-by-location': `cluster origin: ${xrd.clusterName}`,
        'backstage.io/managed-by-origin-location': `cluster origin: ${xrd.clusterName}`,
      });
  }

  /**
   * Sets OpenAPI definition
   */
  withOpenAPIDefinition(definition: string): this {
    return this.withDefinition(definition);
  }

  /**
   * Sets standard API metadata for XRD/CRD
   */
  withResourceAPIMetadata(
    resourceKind: string,
    group: string,
    version: string,
    clusterName: string
  ): this {
    const name = `${resourceKind?.toLowerCase()}-${group}--${version}`;
    return this
      .withName(name)
      .withTitle(name)
      .withAnnotations({
        'backstage.io/managed-by-location': `cluster origin: ${clusterName}`,
        'backstage.io/managed-by-origin-location': `cluster origin: ${clusterName}`,
      });
  }

  build(): Entity {
    return this.entity;
  }
}