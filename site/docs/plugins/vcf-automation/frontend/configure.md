# Configuring the VCF Automation Frontend Plugin

This guide covers the configuration options available for the VCF Automation frontend plugin.

## Configuration

Add the following to your `app-config.yaml`:  
  
Single Instance:  
```yaml
vcfAutomation:
  name: my-vcf-01
  baseUrl: http://your-vcf-automation-service
  majorVersion: 9 # 8 or 9 supported
  orgName: my-org # Required for VCF 9
  organizationType: 'all-apps' # Options: 'vm-apps' (default) or 'all-apps' for VCF 9
  # Enable permission checks
  enablePermissions: true
  # Auth details
  authentication:
    username: 'your-username'
    password: 'your-password'
    domain: 'your-domain' # Required for Aria Automation 8.x
```

Multi Instance:  
```yaml
vcfAutomation:
  enablePermissions: true
  instances:
  - name: my-vcf-01
    baseUrl: 'https://your-vcf-automation-instance'
    majorVersion: 8
    authentication:
      username: 'your-username'
      password: 'your-password'
      domain: 'your-domain'
  - name: my-vcf-02
    baseUrl: 'https://your-vcf-02-automation-instance'
    majorVersion: 9
    orgName: my-org # Required for VCF 9
    organizationType: 'all-apps' # Options: 'vm-apps' (default) or 'all-apps' for VCF 9
    authentication:
      username: 'your-username'
      password: 'your-password'
```  
  
## Links

- [Installation Guide](install.md)
- [About the plugin](about.md)

## Configuration File

The plugin is configured through your `app-config.yaml`. Here's a comprehensive example:

```yaml
vcfAutomation:
  enablePermissions: true
  instances:
  - name: my-vcf-01
    baseUrl: 'https://your-vcf-automation-instance'
    majorVersion: 8
    authentication:
      username: 'your-username'
      password: 'your-password'
      domain: 'your-domain'
  - name: my-vcf-02
    baseUrl: 'https://your-vcf-02-automation-instance'
    majorVersion: 9
    orgName: my-org # Required for VCF 9
    organizationType: 'all-apps' # Options: 'vm-apps' (default) or 'all-apps' for VCF 9
    authentication:
      username: 'your-username'
      password: 'your-password'
```
  
## Best Practices

1. **Component Configuration**
     - Set appropriate refresh intervals
     - Handle errors gracefully
     - Use consistent styling
     - Implement proper validation

2. **Permission Management**
     - Define clear role boundaries
     - Implement least privilege
     - Document access levels
     - Regular permission audits

3. **Performance Optimization**
     - Cache API responses
     - Minimize refresh frequency
     - Implement error boundaries
     - Monitor resource usage

4. **Security**
     - Use secure tokens
     - Implement HTTPS
     - Validate input data
     - Regular security audits
  
For installation instructions, refer to the [Installation Guide](./install.md).
