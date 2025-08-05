export interface Config {
  /**
   * VCF Operations configuration
   * @visibility frontend
   */
  vcfOperations?: {
    instances: Array<{
      /**
       * Instance name
       */
      name: string;
      /**
       * VCF Operations base URL
       * @visibility frontend
       */
      baseUrl: string;
      /**
       * Major version (8 or 9)
       */
      majorVersion: number;
      /**
       * Related VCF Automation instance names
       */
      relatedVCFAInstances?: string[];
      /**
       * Authentication details
       */
      authentication: {
        username: string;
        password: string;
      };
    }>;
  };
}