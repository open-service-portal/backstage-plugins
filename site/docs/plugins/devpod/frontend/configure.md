# Configuring the DevPod Frontend Plugin

This guide covers the configuration options for the DevPod frontend plugin.

## New Frontend System Configuration (Alpha)

When using the new frontend system through the `/alpha` export, the plugin is configured automatically with sensible defaults. The configuration in `app-config.yaml` is still respected:

```yaml
devpod:
  defaultIDE: vscode  # Optional: Set your organization's default IDE
```

The plugin will be automatically integrated into the appropriate entity pages without requiring manual route configuration.

## Basic Configuration

Add the following to your `app-config.yaml`:

```yaml
devpod:
  defaultIDE: vscode  # Optional: Set your organization's default IDE
```

## Configuration Options

### Default IDE

The `defaultIDE` setting determines which IDE is pre-selected in the DevPod launcher. If not specified, it defaults to `vscode`.

Supported values:

- `vscode` - Visual Studio Code
- `vscode-insiders` - VS Code Insiders
- `openvscode` - OpenVSCode
- `intellij` - IntelliJ IDEA
- `pycharm` - PyCharm
- `webstorm` - WebStorm
- `goland` - GoLand
- `clion` - CLion
- `phpstorm` - PhpStorm
- `rider` - Rider
- `rubymine` - RubyMine
- `rustrover` - RustRover
- `fleet` - JetBrains Fleet
- `cursor` - Cursor
- `jupyternotebook` - Jupyter Notebook

## Component Customization

### Grid Placement

You can customize where the DevPod component appears in your entity overview page by adjusting its grid placement:

```typescript
<Grid item md={6} xs={12}>  // Adjust size as needed
  <DevpodComponent />
</Grid>
```

### Conditional Rendering

The `isDevpodAvailable` condition can be combined with other checks:

```typescript
<EntitySwitch>
  <EntitySwitch.Case if={e => isDevpodAvailable(e) && isGitRepository(e)}>
    <Grid item md={6}>
      <DevpodComponent />
    </Grid>
  </EntitySwitch.Case>
</EntitySwitch>
```

## Best Practices

1. **IDE Selection**
    - Choose a default IDE that matches your team's primary development environment
    - Consider your developers' preferences and workflows
    - Ensure the selected IDE is installed on development machines

2. **Component Placement**
    - Place the DevPod button where it's easily accessible
    - Consider grouping it with other development-related tools
    - Maintain consistent placement across different entity types

3. **User Experience**
    - Provide clear documentation about available IDEs
    - Ensure DevPod is properly installed on development machines
    - Consider adding links to DevPod installation guides
