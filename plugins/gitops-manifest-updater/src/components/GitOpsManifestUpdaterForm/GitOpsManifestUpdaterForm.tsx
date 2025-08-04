import { useState, useCallback, useEffect, ChangeEvent } from 'react';
import { useApi, fetchApiRef, githubAuthApiRef, gitlabAuthApiRef, bitbucketAuthApiRef } from '@backstage/core-plugin-api';
import {
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { 
  FormControl, 
  TextField, 
  Typography, 
  Checkbox,
  Select,
  MenuItem,
} from '@material-ui/core';
import { JsonObject } from '@backstage/types';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { parse as parseYaml } from 'yaml';
import { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';
import { scmIntegrationsApiRef } from '@backstage/integration-react';

type FormData = {
  sourceURI?: string;
};

type OpenAPISpec = {
  components: {
    schemas: {
      Resource: JsonObject;
    };
  };
};

type SchemaProperty = {
  type: string;
  title?: string;
  description?: string;
  properties?: Record<string, SchemaProperty>;
  items?: SchemaProperty;
  format?: string;
  enum?: any[];
  additionalProperties?: any;
  'ui:widget'?: string;
  'ui:options'?: any;
  'x-kubernetes-preserve-unknown-fields'?: boolean;
};

const crossplaneFields = [
  'claimRef',
  'compositionRef',
  'compositionRevisionRef',
  'compositionRevisionSelector',
  'compositionSelector',
  'compositionUpdatePolicy',
  'publishConnectionDetailsTo',
  'writeConnectionSecretToRef',
];

const KeyValueEditor = ({ value, onChange }: { value: Record<string, string>, onChange: (kv: Record<string, string>) => void }) => {
  const [entries, setEntries] = useState(Object.entries(value || {}));

  const handleChange = (idx: number, key: string, val: string) => {
    const newEntries = [...entries];
    newEntries[idx] = [key, val];
    setEntries(newEntries);
    onChange(Object.fromEntries(newEntries.filter(([k]) => k)));
  };

  const handleAdd = () => {
    setEntries([...entries, ['', '']]);
  };

  const handleRemove = (idx: number) => {
    const newEntries = entries.filter((_, i) => i !== idx);
    setEntries(newEntries);
    onChange(Object.fromEntries(newEntries.filter(([k]) => k)));
  };

  return (
    <div>
      {entries.map(([k, v], idx) => (
        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <TextField
            label="Key"
            value={k}
            onChange={e => handleChange(idx, e.target.value, v)}
            size="small"
          />
          <TextField
            label="Value"
            value={v}
            onChange={e => handleChange(idx, k, e.target.value)}
            size="small"
          />
          <button onClick={() => handleRemove(idx)} type="button">Remove</button>
        </div>
      ))}
      <button onClick={handleAdd} type="button">Add</button>
    </div>
  );
};

const RenderField = ({
  prop,
  value,
  label,
  fullPath,
  onChange,
}: {
  prop: SchemaProperty;
  value: any;
  label: string;
  fullPath: string;
  onChange: (path: string, value: any) => void;
}) => {
  // Handle fields with x-kubernetes-preserve-unknown-fields: true that don't have a type
  if (prop['x-kubernetes-preserve-unknown-fields'] === true && !prop.type) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginTop: '8px', marginBottom: '4px' }}>
        <Typography variant="body1" style={{ minWidth: '150px', marginTop: '8px' }}>{label}:</Typography>
        <TextField
          helperText={prop.description}
          value={value === undefined ? '' : value.toString()}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(fullPath, e.target.value)}
          fullWidth
          margin="dense"
          multiline
          rows={10}
          style={{ flexGrow: 1 }}
        />
      </div>
    );
  }
  
  // Handle fields with ui:widget set to textarea
  if (prop['ui:widget'] === 'textarea') {
    const rows = prop['ui:options']?.rows || 10;
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginTop: '8px', marginBottom: '4px' }}>
        <Typography variant="body1" style={{ minWidth: '150px', marginTop: '8px' }}>{label}:</Typography>
        <TextField
          helperText={prop.description}
          value={value === undefined ? '' : value.toString()}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(fullPath, e.target.value)}
          fullWidth
          margin="dense"
          multiline
          rows={rows}
          style={{ flexGrow: 1 }}
        />
      </div>
    );
  }

  // Render map fields (object with additionalProperties and no properties)
  if (
    prop.type === 'object' &&
    prop.additionalProperties &&
    !prop.properties
  ) {
    return (
      <div style={{ marginTop: 8, marginBottom: 4 }}>
        <Typography variant="body1" style={{ minWidth: '150px' }}>{label}:</Typography>
        <KeyValueEditor
          value={value || {}}
          onChange={kv => onChange(fullPath, kv)}
        />
      </div>
    );
  }

  if (prop.enum) {
    return (
      <FormControl fullWidth margin="normal">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Typography variant="body1" style={{ minWidth: '150px' }}>{label}:</Typography>
          <Select
            value={value === undefined ? '' : value}
            onChange={(e) => onChange(fullPath, e.target.value)}
            displayEmpty
            style={{ flexGrow: 1 }}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {prop.enum.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        </div>
      </FormControl>
    );
  }

  switch (prop.type) {
    case 'boolean':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px', marginBottom: '4px' }}>
          <Typography variant="body1" style={{ minWidth: '150px' }}>
            {label}:
          </Typography>
          <Checkbox
            checked={value === undefined ? false : Boolean(value)}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              onChange(fullPath, e.target.checked);
            }}
            color="primary"
          />
        </div>
      );
    case 'integer':
    case 'number':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px', marginBottom: '4px' }}>
          <Typography variant="body1" style={{ minWidth: '150px' }}>{label}:</Typography>
          <TextField
            helperText={prop.description}
            value={value === undefined ? '' : value.toString()}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const newValue = prop.type === 'integer' 
                ? parseInt(e.target.value, 10) 
                : parseFloat(e.target.value);
              onChange(fullPath, isNaN(newValue) ? '' : newValue);
            }}
            type="number"
            fullWidth
            margin="dense"
            style={{ flexGrow: 1 }}
          />
        </div>
      );
    default:
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px', marginBottom: '4px' }}>
          <Typography variant="body1" style={{ minWidth: '150px' }}>{label}:</Typography>
          <TextField
            helperText={prop.description}
            value={value === undefined ? '' : value.toString()}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(fullPath, e.target.value)}
            fullWidth
            margin="dense"
            style={{ flexGrow: 1 }}
          />
        </div>
      );
  }
};

const RenderFields = ({
  schema,
  formData,
  parentPath = '',
  onFieldChange,
  showCrossplaneSettings,
  hasCrossplane,
  crossplaneFieldsPresent,
  renderToggleCheckbox,
  onToggleCheckbox,
  isTopLevel = false,
}: {
  schema: Record<string, SchemaProperty>;
  formData: JsonObject;
  parentPath?: string;
  onFieldChange: (path: string, value: any) => void;
  showCrossplaneSettings?: boolean;
  hasCrossplane?: boolean;
  crossplaneFieldsPresent?: boolean;
  renderToggleCheckbox?: boolean;
  onToggleCheckbox?: (checked: boolean) => void;
  isTopLevel?: boolean;
}) => {
  const getNestedValue = (data: JsonObject, path: string): any => {
    if (!path) return data;
    const parts = path.split('.');
    let current: any = data;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }
    return current;
  };

  if (isTopLevel) {
    // At the root, split fields for toggle logic
    const alwaysVisibleFields: [string, SchemaProperty][] = [];
    const toggleFields: [string, SchemaProperty][] = [];
    Object.entries(schema).forEach(([key, prop]) => {
      if (key === 'resourceRefs') return; // never render
      if (key === 'crossplane' || crossplaneFields.includes(key)) {
        toggleFields.push([key, prop]);
      } else {
        alwaysVisibleFields.push([key, prop]);
      }
    });
    return (
      <>
        {/* Render always visible fields */}
        {alwaysVisibleFields.map(([key, prop]) => {
          const fullPath = parentPath ? `${parentPath}.${key}` : key;
          const value = getNestedValue(formData, fullPath);
          if (prop.type === 'object' && prop.properties) {
            return (
              <div key={key}>
                <Typography variant="subtitle1" style={{ marginTop: '16px' }}>
                  {prop.title || key}
                </Typography>
                {prop.description && (
                  <Typography variant="body2" color="textSecondary">
                    {prop.description}
                  </Typography>
                )}
                <div style={{ marginLeft: '16px' }}>
                  <RenderFields
                    schema={prop.properties}
                    formData={formData}
                    parentPath={fullPath}
                    onFieldChange={onFieldChange}
                    showCrossplaneSettings={showCrossplaneSettings}
                    hasCrossplane={hasCrossplane}
                    crossplaneFieldsPresent={crossplaneFieldsPresent}
                    isTopLevel={false}
                  />
                </div>
              </div>
            );
          }
          return (
            <RenderField
              key={fullPath}
              prop={prop}
              value={value}
              label={prop.title || key}
              fullPath={fullPath}
              onChange={onFieldChange}
            />
          );
        })}
        {/* Render the toggle checkbox if needed (only at top level) */}
        {renderToggleCheckbox && onToggleCheckbox && (
          <FormControl margin="normal" fullWidth>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <Checkbox
                checked={!!showCrossplaneSettings}
                onChange={e => onToggleCheckbox(e.target.checked)}
                color="primary"
              />
              <Typography variant="body1">Show Crossplane Settings</Typography>
            </div>
          </FormControl>
        )}
        {/* Render toggle-controlled fields if toggle is on */}
        {showCrossplaneSettings && toggleFields.map(([key, prop]) => {
          const fullPath = parentPath ? `${parentPath}.${key}` : key;
          const value = getNestedValue(formData, fullPath);
          if (prop.type === 'object' && prop.properties) {
            return (
              <div key={key}>
                <Typography variant="subtitle1" style={{ marginTop: '16px' }}>
                  {prop.title || key}
                </Typography>
                {prop.description && (
                  <Typography variant="body2" color="textSecondary">
                    {prop.description}
                  </Typography>
                )}
                <div style={{ marginLeft: '16px' }}>
                  <RenderFields
                    schema={prop.properties}
                    formData={formData}
                    parentPath={fullPath}
                    onFieldChange={onFieldChange}
                    showCrossplaneSettings={showCrossplaneSettings}
                    hasCrossplane={hasCrossplane}
                    crossplaneFieldsPresent={crossplaneFieldsPresent}
                    isTopLevel={false}
                  />
                </div>
              </div>
            );
          }
          return (
            <RenderField
              key={fullPath}
              prop={prop}
              value={value}
              label={prop.title || key}
              fullPath={fullPath}
              onChange={onFieldChange}
            />
          );
        })}
      </>
    );
  }

  // For nested objects, just skip resourceRefs
  return (
    <>
      {Object.entries(schema).map(([key, prop]) => {
        if (key === 'resourceRefs') return null;
        const fullPath = parentPath ? `${parentPath}.${key}` : key;
        const value = getNestedValue(formData, fullPath);
        if (prop.type === 'object' && prop.properties) {
          return (
            <div key={key}>
              <Typography variant="subtitle1" style={{ marginTop: '16px' }}>
                {prop.title || key}
              </Typography>
              {prop.description && (
                <Typography variant="body2" color="textSecondary">
                  {prop.description}
                </Typography>
              )}
              <div style={{ marginLeft: '16px' }}>
                <RenderFields
                  schema={prop.properties}
                  formData={formData}
                  parentPath={fullPath}
                  onFieldChange={onFieldChange}
                  showCrossplaneSettings={showCrossplaneSettings}
                  hasCrossplane={hasCrossplane}
                  crossplaneFieldsPresent={crossplaneFieldsPresent}
                  isTopLevel={false}
                />
              </div>
            </div>
          );
        }
        return (
          <RenderField
            key={fullPath}
            prop={prop}
            value={value}
            label={prop.title || key}
            fullPath={fullPath}
            onChange={onFieldChange}
          />
        );
      })}
    </>
  );
};

export const GitOpsManifestUpdaterForm = ({
  onChange,
  formContext,
}: FieldExtensionComponentProps<JsonObject, FormData>): JSX.Element => {
  const [loading, setLoading] = useState(true);
  const [schema, setSchema] = useState<JsonObject | null>(null);
  const [formData, setFormData] = useState<JsonObject | null>(null);
  const [error, setError] = useState<Error>();
  const [manualSourceUrl, setManualSourceUrl] = useState<string>('');
  const [showCrossplaneSettings, setShowCrossplaneSettings] = useState(false);

  const fetchApi = useApi(fetchApiRef);
  const catalogApi = useApi(catalogApiRef);
  const scmIntegrations = useApi(scmIntegrationsApiRef);
  const githubAuth = useApi(githubAuthApiRef);
  const gitlabAuth = useApi(gitlabAuthApiRef);
  const bitbucketAuth = useApi(bitbucketAuthApiRef);

  const getEntityFromRef = useCallback(async (entityRef: string) => {
    try {
      const response = await catalogApi.getEntityByRef(entityRef);
      if (!response) {
        throw new Error('Entity not found');
      }
      return response;
    } catch (err) {
      throw new Error(`Failed to fetch entity: ${err}`);
    }
  }, [catalogApi]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const entityRef = formContext?.formData?.entity;
        
        let sourceURI: string | undefined;

        if (entityRef) {
          const entity = await getEntityFromRef(entityRef);
          sourceURI = entity.metadata.annotations?.['terasky.backstage.io/source-file-url'] || formContext?.formData?.sourceFileUrl;
        }

        // If no sourceURI from annotation, use manual input
        if (!sourceURI) {
          sourceURI = manualSourceUrl;
        }

        if (!sourceURI) {
          setLoading(false);
          return;
        }

        const scmIntegration = scmIntegrations.byUrl(sourceURI);
        
        if (!scmIntegration) {
          throw new Error('No matching SCM integration found for URL');
        }

        // Convert SCM URLs to API URLs
        let fetchUrl = sourceURI;
        const headers: HeadersInit = {};

        if (scmIntegration.type === 'github') {
          // Handle both GitHub.com and GitHub Enterprise
          // URL format: https://github.com/owner/repo/blob/branch/path/to/file.yaml
          // or: https://github.enterprise.com/owner/repo/blob/branch/path/to/file.yaml
          const githubMatch = sourceURI.match(/^https?:\/\/([^/]+)\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
          if (!githubMatch) {
            throw new Error(`Invalid GitHub URL format: ${sourceURI}. Expected format: https://github.com/owner/repo/blob/branch/path/to/file.yaml`);
          }
          const [, host, owner, repo, branch, path] = githubMatch;
          
          if (host === 'github.com') {
            fetchUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
          } else {
            // GitHub Enterprise
            fetchUrl = `https://${host}/api/v3/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
          }
          
          headers['Accept'] = 'application/vnd.github.v3.raw';
          
          try {
            const token = await githubAuth.getAccessToken(['repo']);
            if (token) {
              headers.Authorization = `token ${token}`;
            }
          } catch (authError) {
            throw new Error('Failed to get GitHub authentication token');
          }
        } else if (scmIntegration.type === 'gitlab') {
          // Handle both GitLab.com and self-hosted GitLab
          // URL format: https://gitlab.com/group/subgroup/project/-/blob/branch/path/to/file.yaml
          // or: https://gitlab.company.com/group/subgroup/project/-/blob/branch/path/to/file.yaml
          const gitlabMatch = sourceURI.match(/^https?:\/\/([^/]+)\/(.+)\/-\/blob\/([^/]+)\/(.+)$/);
          if (!gitlabMatch) {
            throw new Error(`Invalid GitLab URL format: ${sourceURI}. Expected format: https://gitlab.com/group/project/-/blob/branch/path/to/file.yaml`);
          }
          const [, host, groupAndProject, branch, path] = gitlabMatch;
          const projectPath = encodeURIComponent(groupAndProject);
          const filePath = encodeURIComponent(path);
          
          fetchUrl = `https://${host}/api/v4/projects/${projectPath}/repository/files/${filePath}/raw?ref=${branch}`;
          
          try {
            const token = await gitlabAuth.getAccessToken(['read_repository']);
            if (token) {
              headers.Authorization = `Bearer ${token}`;
            }
          } catch (authError) {
            throw new Error('Failed to get GitLab authentication token');
          }
        } else if (scmIntegration.type === 'bitbucket') {
          // Handle Bitbucket Cloud
          // URL format: https://bitbucket.org/workspace/repo/src/branch/path/to/file.yaml
          const bitbucketCloudMatch = sourceURI.match(/^https?:\/\/bitbucket\.org\/([^/]+)\/([^/]+)\/src\/([^/]+)\/(.+)$/);
          if (!bitbucketCloudMatch) {
            throw new Error(`Invalid Bitbucket Cloud URL format: ${sourceURI}. Expected format: https://bitbucket.org/workspace/repo/src/branch/path/to/file.yaml`);
          }
          const [, workspace, repo, branch, path] = bitbucketCloudMatch;
          fetchUrl = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/src/${branch}/${path}`;
          
          try {
            const token = await bitbucketAuth.getAccessToken(['repository']);
            if (token) {
              headers.Authorization = `Bearer ${token}`;
            }
          } catch (authError) {
            throw new Error('Failed to get Bitbucket authentication token');
          }
        } else if (scmIntegration.type === 'bitbucket-server') {
          // Handle Bitbucket Server (on-premises)
          // URL format: https://bitbucket.company.com/projects/PROJECT/repos/repo/browse/path/to/file.yaml?at=refs%2Fheads%2Fbranch
          // or: https://bitbucket.company.com/projects/PROJECT/repos/repo/browse/path/to/file.yaml?at=branch
          let bitbucketServerMatch = sourceURI.match(/^https?:\/\/([^/]+)\/projects\/([^/]+)\/repos\/([^/]+)\/browse\/([^?]+)\?at=refs%2Fheads%2F([^&]+)/);
          if (!bitbucketServerMatch) {
            // Try alternative format without refs/heads encoding
            bitbucketServerMatch = sourceURI.match(/^https?:\/\/([^/]+)\/projects\/([^/]+)\/repos\/([^/]+)\/browse\/([^?]+)\?at=([^&]+)/);
          }
          if (!bitbucketServerMatch) {
            throw new Error(`Invalid Bitbucket Server URL format: ${sourceURI}. Expected format: https://bitbucket.company.com/projects/PROJECT/repos/repo/browse/path/to/file.yaml?at=branch`);
          }
          const [, host, project, repo, path, branch] = bitbucketServerMatch;
          fetchUrl = `https://${host}/rest/api/1.0/projects/${project}/repos/${repo}/raw/${path}?at=${branch}`;
          
          try {
            const token = await bitbucketAuth.getAccessToken(['PROJECT_READ']);
            if (token) {
              headers.Authorization = `Bearer ${token}`;
            }
          } catch (authError) {
            throw new Error('Failed to get Bitbucket Server authentication token');
          }
        } else {
          throw new Error(`Unsupported SCM integration type: ${scmIntegration.type}. Supported types: github, gitlab, bitbucket, bitbucket-server`);
        }

        // Use Backstage's fetch API with auth headers
        const response = await fetchApi.fetch(fetchUrl, {
          headers: headers,
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
        }

        const fileContent = await response.text();

        let yamlContent;
        try {
          yamlContent = parseYaml(fileContent.trim());
        } catch (error: any) {
          throw new Error(`Failed to parse YAML content: ${error.message}`);
        }

        if (!yamlContent || typeof yamlContent !== 'object') {
          throw new Error('Invalid YAML content: expected an object');
        }

        const { items: entities } = await catalogApi.getEntities({
          filter: {
            kind: 'API',
            'metadata.name': `${yamlContent.kind.toLowerCase()}-${yamlContent.apiVersion.split('/')[0].toLowerCase()}--${yamlContent.apiVersion.split('/')[1].toLowerCase()}`,
          },
        });

        if (entities.length === 0) {
          throw new Error('No matching API entity found');
        }

        const apiEntity = entities[0];
        const openApiSpec = typeof apiEntity?.spec?.definition === 'string' 
          ? parseYaml(apiEntity.spec.definition) 
          : apiEntity?.spec?.definition as OpenAPISpec;

        if (!openApiSpec?.components?.schemas?.Resource) {
          throw new Error('Invalid OpenAPI spec: missing Resource schema');
        }

        const resourceSchema = openApiSpec.components.schemas.Resource;
        const specSchema = resourceSchema.properties?.spec?.properties || {};

        setSchema(specSchema);
        setFormData(yamlContent.spec as JsonObject);
        setError(undefined);

      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [formContext?.formData?.entity, manualSourceUrl, fetchApi, catalogApi, scmIntegrations, githubAuth, gitlabAuth, bitbucketAuth, getEntityFromRef]);

  const handleFieldChange = (path: string, value: any) => {
    if (!formData) return;

    const pathParts = path.split('.');
    const newFormData = { ...formData };
    let current = newFormData;

    // Navigate to the nested object
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!current[pathParts[i]]) {
        current[pathParts[i]] = {};
      }
      current = current[pathParts[i]] as JsonObject;
    }

    // Set the value
    current[pathParts[pathParts.length - 1]] = value;
    setFormData(newFormData);
    onChange(newFormData);
  };

  // Determine if crossplane toggle should be shown
  let hasCrossplane = false;
  let crossplaneFieldsPresent = false;
  if (schema && schema['crossplane']) {
    hasCrossplane = true;
  } else if (schema) {
    crossplaneFieldsPresent = crossplaneFields.some(f => Object.keys(schema).includes(f));
  }

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  return (
    <>
      {!formContext?.formData?.entity && (
        <TextField
          label="Source File URL"
          helperText="The URL to the YAML file in your repository if not available in the entity annotations"
          value={manualSourceUrl}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setManualSourceUrl(e.target.value)}
          fullWidth
          margin="normal"
        />
      )}
      {schema && formData && (
        <FormControl margin="normal" fullWidth>
          <RenderFields
            schema={schema as Record<string, SchemaProperty>}
            formData={formData}
            onFieldChange={handleFieldChange}
            showCrossplaneSettings={showCrossplaneSettings}
            hasCrossplane={hasCrossplane}
            crossplaneFieldsPresent={crossplaneFieldsPresent}
            renderToggleCheckbox={hasCrossplane || crossplaneFieldsPresent}
            onToggleCheckbox={setShowCrossplaneSettings}
            isTopLevel={true}
          />
        </FormControl>
      )}
    </>
  );
}; 