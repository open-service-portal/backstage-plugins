import React from 'react';
import { createDevApp } from '@backstage/dev-utils';
import { vcfOperationsPlugin } from '../src/plugin';

createDevApp()
  .registerPlugin(vcfOperationsPlugin)
  .addPage({
    element: <div>VCF Operations Plugin Development</div>,
    title: 'VCF Operations',
    path: '/vcf-operations'
  })
  .render();