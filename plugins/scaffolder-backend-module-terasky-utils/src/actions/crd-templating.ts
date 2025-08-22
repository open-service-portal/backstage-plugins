import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { resolveSafeChildPath } from '@backstage/backend-plugin-api';
import yaml from 'js-yaml';
import fs from 'fs-extra';
import path from 'path';

// Helper function to generate SCM-specific URLs
function generateSourceFileUrl(gitRepo: string, gitBranch: string, filePath: string, scmType: string): string {
  const gitUrl = new URL("https://" + gitRepo);
  const owner = gitUrl.searchParams.get('owner');
  const repo = gitUrl.searchParams.get('repo');
  
  if (!owner || !repo) {
    return '';
  }

  const host = gitUrl.host;
  
  // Determine URL format based on configured SCM type
  switch (scmType?.toLowerCase()) {
    case 'gitlab':
      // GitLab or self-hosted GitLab
      return `https://${host}/${owner}/${repo}/-/blob/${gitBranch}/${filePath}`;
    case 'bitbucketcloud':
      // Bitbucket Cloud
      return `https://${host}/${owner}/${repo}/src/${gitBranch}/${filePath}`;
    case 'bitbucket':
      // Bitbucket Server
      return `https://${host}/projects/${owner}/repos/${repo}/browse/${filePath}?at=${gitBranch}`;
    case 'github':
    default:
      // GitHub or GitHub Enterprise
      return `https://${host}/${owner}/${repo}/blob/${gitBranch}/${filePath}`;
  }
}

export function createCrdTemplateAction({config}: {config: any}) {
  return createTemplateAction({
    id: 'terasky:crd-template',
    description: 'Templates a CRD manifest based on input parameters',
    schema: {
      input: {
        ownerParam: z => z.any(),
        parameters: z => z.record(z.any()),
        nameParam: z => z.string(),
        namespaceParam: z => z.string().optional(),
        excludeParams: z => z.array(z.string()),
        apiVersion: z => z.string(),
        kind: z => z.string(),
        removeEmptyParams: z => z.boolean().optional(),
        clusters: z => z.array(z.string()).min(1),
      },
      output: {
        manifest: z => z.string(),
        filePaths: z => z.array(z.string()),
      },
    },
    async handler(ctx) {
      const input = ctx.input;
      ctx.logger.info(
        `Running CRD template with parameters: ${JSON.stringify(input.parameters)}`,
      );

      // Remove excluded parameters
      const filteredParameters = { ...input.parameters };
      input.excludeParams.forEach((param: string) => {
        delete filteredParameters[param];
      });

      // Remove empty parameters if removeEmptyParams is true
      if (input.removeEmptyParams) {
        const removeEmpty = (obj: any) => {
          Object.keys(obj).forEach(key => {
            if (obj[key] && typeof obj[key] === 'object') {
              removeEmpty(obj[key]);
              if (Object.keys(obj[key]).length === 0) {
                delete obj[key];
              }
            } else if (obj[key] === null || obj[key] === undefined || obj[key] === '' || (Array.isArray(obj[key]) && obj[key].length === 0)) {
              delete obj[key];
            }
          });
        };
        removeEmpty(filteredParameters);
      }
      const sourceInfo = {
        pushToGit: (input.parameters as any).pushToGit,
        gitBranch: (input.parameters as any).targetBranch || config.getOptionalString('kubernetesIngestor.crossplane.xrds.publishPhase.git.targetBranch'),
        gitRepo: (input.parameters as any).repoUrl || config.getOptionalString('kubernetesIngestor.crossplane.xrds.publishPhase.git.repoUrl'),
        gitLayout: (input.parameters as any).manifestLayout,
        basePath: (input.parameters as any).manifestLayout === 'custom' 
          ? (input.parameters as any).basePath 
          : (input.parameters as any).manifestLayout === 'namespace-scoped'
            ? `${(input.parameters as any)[input.namespaceParam || 'namespace']}`
            : `${input.clusters[0]}/${(input.parameters as any)[input.namespaceParam || 'namespace']}/${input.kind}`
      }
      let sourceFileUrl = '';
      if ((input.parameters as any).pushToGit && sourceInfo.gitRepo) {
        const scmType = config.getOptionalString('kubernetesIngestor.genericCRDTemplates.publishPhase.target') || 'github';
        const filePath = `${sourceInfo.basePath}/${(input.parameters as any)[input.nameParam]}.yaml`;
        sourceFileUrl = generateSourceFileUrl(sourceInfo.gitRepo, sourceInfo.gitBranch, filePath, scmType);
      }
      // Template the Kubernetes resource manifest
      const manifest = {
        apiVersion: input.apiVersion,
        kind: input.kind,
        metadata: {
          name: (input.parameters as any)[input.nameParam],
          ...(input.namespaceParam && {
            namespace: (input.parameters as any)[input.namespaceParam],
          }),
          annotations: {
            'terasky.backstage.io/source-info': JSON.stringify(sourceInfo),
            'terasky.backstage.io/add-to-catalog': "true",
            'terasky.backstage.io/owner': (input.parameters as any)[input.ownerParam],
            'terasky.backstage.io/system': (input.parameters as any)[input.namespaceParam || 'namespace'],
            ...(sourceFileUrl && { 'terasky.backstage.io/source-file-url': sourceFileUrl }),
          },
        },
        spec: filteredParameters,
      };

      // Convert manifest to YAML
      const manifestYaml = yaml.dump(manifest);

      // Handle cluster-specific paths or default path
      const filePaths: string[] = [];
      input.clusters.forEach((cluster: string) => {
        const filePath = path.join(
          cluster,
          (input.parameters as any)[input.namespaceParam || 'namespace'] || "",
          input.kind,
          `${(input.parameters as any)[input.nameParam]}.yaml`
        );
        const destFilepath = resolveSafeChildPath(ctx.workspacePath, filePath);
        fs.outputFileSync(destFilepath, manifestYaml);
        ctx.logger.info(`Manifest written to ${destFilepath}`);
        filePaths.push(destFilepath);
      });

      // Output the manifest and file paths
      ctx.output('manifest', manifestYaml);
      ctx.output('filePaths', filePaths);
    },
  });
} 
