# VCF Operations Backend

This plugin provides backend API endpoints for accessing VCF Operations metrics data.

## Features

- Authentication with VCF Operations instances (v8 and v9)
- Multiple instance support with automatic failover
- Resource metrics querying and retrieval
- Real-time and historical metrics data
- Resource discovery and details

## API Endpoints

- `GET /api/vcf-operations/instances` - List configured VCF Operations instances
- `GET /api/vcf-operations/resources/:id/metrics` - Get metrics for a specific resource
- `POST /api/vcf-operations/metrics/query` - Query metrics for multiple resources
- `GET /api/vcf-operations/metrics/latest` - Get latest metrics for resources
- `GET /api/vcf-operations/resources/:id` - Get resource details
- `GET /api/vcf-operations/resources` - Search resources

## Installation

This plugin is meant to be installed in a Backstage backend.