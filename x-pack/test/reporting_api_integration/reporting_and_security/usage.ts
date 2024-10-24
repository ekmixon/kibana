/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { FtrProviderContext } from '../ftr_provider_context';
import * as GenerationUrls from '../services/generation_urls';
import { ReportingUsageStats } from '../services/usage';

const JOB_PARAMS_CSV_DEFAULT_SPACE =
  `columns:!(order_date,category,customer_full_name,taxful_total_price,currency),objectType:search,searchSource:(fields:!((field:'*',include_unmapped:true))` +
  `,filter:!((meta:(field:order_date,index:aac3e500-f2c7-11ea-8250-fb138aa491e7,params:()),query:(range:(order_date:(format:strict_date_optional_time,gte:'2019-06-02T12:28:40.866Z'` +
  `,lte:'2019-07-18T20:59:57.136Z'))))),index:aac3e500-f2c7-11ea-8250-fb138aa491e7,parent:(filter:!(),highlightAll:!t,index:aac3e500-f2c7-11ea-8250-fb138aa491e7` +
  `,query:(language:kuery,query:''),version:!t),sort:!((order_date:desc)),trackTotalHits:!t)`;
const OSS_KIBANA_ARCHIVE_PATH = 'test/functional/fixtures/es_archiver/dashboard/current/kibana';
const OSS_DATA_ARCHIVE_PATH = 'test/functional/fixtures/es_archiver/dashboard/current/data';

interface UsageStats {
  reporting: ReportingUsageStats;
}

// eslint-disable-next-line import/no-default-export
export default function ({ getService }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const reportingAPI = getService('reportingAPI');
  const retry = getService('retry');
  const usageAPI = getService('usageAPI');

  describe('Usage', () => {
    const deleteAllReports = () => reportingAPI.deleteAllReports();
    beforeEach(deleteAllReports);
    after(deleteAllReports);

    describe('initial state', () => {
      let usage: UsageStats;

      before(async () => {
        await retry.try(async () => {
          // use retry for stability - usage API could return 503
          usage = (await usageAPI.getUsageStats()) as UsageStats;
        });
      });

      it('shows reporting as available and enabled', async () => {
        expect(usage.reporting.available).to.be(true);
        expect(usage.reporting.enabled).to.be(true);
      });

      it('all counts are 0', async () => {
        reportingAPI.expectRecentPdfAppStats(usage, 'visualization', 0);
        reportingAPI.expectAllTimePdfAppStats(usage, 'visualization', 0);
        reportingAPI.expectRecentPdfAppStats(usage, 'dashboard', 0);
        reportingAPI.expectAllTimePdfAppStats(usage, 'dashboard', 0);
        reportingAPI.expectRecentPdfLayoutStats(usage, 'preserve_layout', 0);
        reportingAPI.expectAllTimePdfLayoutStats(usage, 'preserve_layout', 0);
        reportingAPI.expectAllTimePdfLayoutStats(usage, 'print', 0);
        reportingAPI.expectRecentPdfLayoutStats(usage, 'print', 0);
        reportingAPI.expectRecentJobTypeTotalStats(usage, 'csv_searchsource', 0);
        reportingAPI.expectAllTimeJobTypeTotalStats(usage, 'csv_searchsource', 0);
        reportingAPI.expectRecentJobTypeTotalStats(usage, 'printable_pdf', 0);
        reportingAPI.expectAllTimeJobTypeTotalStats(usage, 'printable_pdf', 0);
      });
    });

    describe('from archive data', () => {
      it('generated from 6.2', async () => {
        await esArchiver.load('x-pack/test/functional/es_archives/reporting/bwc/6_2');
        const usage = await usageAPI.getUsageStats();

        reportingAPI.expectRecentJobTypeTotalStats(usage, 'csv', 0);
        reportingAPI.expectRecentJobTypeTotalStats(usage, 'printable_pdf', 0);

        reportingAPI.expectAllTimeJobTypeTotalStats(usage, 'csv', 1);
        reportingAPI.expectAllTimeJobTypeTotalStats(usage, 'printable_pdf', 7);

        // These statistics weren't tracked until 6.3
        reportingAPI.expectRecentPdfAppStats(usage, 'visualization', 0);
        reportingAPI.expectRecentPdfAppStats(usage, 'dashboard', 0);
        reportingAPI.expectRecentPdfLayoutStats(usage, 'preserve_layout', 0);
        reportingAPI.expectRecentPdfLayoutStats(usage, 'print', 0);
        reportingAPI.expectAllTimePdfAppStats(usage, 'visualization', 0);
        reportingAPI.expectAllTimePdfAppStats(usage, 'dashboard', 0);
        reportingAPI.expectAllTimePdfLayoutStats(usage, 'preserve_layout', 0);
        reportingAPI.expectAllTimePdfLayoutStats(usage, 'print', 0);

        await esArchiver.unload('x-pack/test/functional/es_archives/reporting/bwc/6_2');
      });

      it('generated from 6.3', async () => {
        await esArchiver.load('x-pack/test/functional/es_archives/reporting/bwc/6_3');
        const usage = await usageAPI.getUsageStats();

        reportingAPI.expectRecentJobTypeTotalStats(usage, 'csv', 0);
        reportingAPI.expectRecentJobTypeTotalStats(usage, 'printable_pdf', 0);
        reportingAPI.expectRecentPdfAppStats(usage, 'visualization', 0);
        reportingAPI.expectRecentPdfAppStats(usage, 'dashboard', 0);
        reportingAPI.expectRecentPdfLayoutStats(usage, 'preserve_layout', 0);
        reportingAPI.expectRecentPdfLayoutStats(usage, 'print', 0);

        reportingAPI.expectAllTimeJobTypeTotalStats(usage, 'csv', 2);
        reportingAPI.expectAllTimeJobTypeTotalStats(usage, 'printable_pdf', 12);
        reportingAPI.expectAllTimePdfAppStats(usage, 'visualization', 3);
        reportingAPI.expectAllTimePdfAppStats(usage, 'dashboard', 3);
        reportingAPI.expectAllTimePdfLayoutStats(usage, 'preserve_layout', 3);
        reportingAPI.expectAllTimePdfLayoutStats(usage, 'print', 3);

        await esArchiver.unload('x-pack/test/functional/es_archives/reporting/bwc/6_3');
      });
    });

    describe('from new jobs posted', () => {
      before(async () => {
        await esArchiver.load(OSS_KIBANA_ARCHIVE_PATH);
        await esArchiver.load(OSS_DATA_ARCHIVE_PATH);
        await reportingAPI.initEcommerce();
      });

      after(async () => {
        await esArchiver.unload(OSS_KIBANA_ARCHIVE_PATH);
        await esArchiver.unload(OSS_DATA_ARCHIVE_PATH);
        await reportingAPI.teardownEcommerce();
      });

      it('should handle csv_searchsource', async () => {
        await reportingAPI.expectAllJobsToFinishSuccessfully(
          await Promise.all([
            reportingAPI.postJob(
              `/api/reporting/generate/csv_searchsource?jobParams=(${JOB_PARAMS_CSV_DEFAULT_SPACE})`
            ),
          ])
        );

        const usage = await usageAPI.getUsageStats();
        reportingAPI.expectRecentPdfAppStats(usage, 'visualization', 0);
        reportingAPI.expectRecentPdfAppStats(usage, 'dashboard', 0);
        reportingAPI.expectRecentPdfLayoutStats(usage, 'preserve_layout', 0);
        reportingAPI.expectRecentPdfLayoutStats(usage, 'print', 0);
        reportingAPI.expectRecentJobTypeTotalStats(usage, 'csv_searchsource', 1);
        reportingAPI.expectRecentJobTypeTotalStats(usage, 'printable_pdf', 0);
      });

      it('should handle preserve_layout pdf', async () => {
        await reportingAPI.expectAllJobsToFinishSuccessfully(
          await Promise.all([
            reportingAPI.postJob(GenerationUrls.PDF_PRESERVE_DASHBOARD_FILTER_6_3),
            reportingAPI.postJob(GenerationUrls.PDF_PRESERVE_PIE_VISUALIZATION_6_3),
          ])
        );

        const usage = await usageAPI.getUsageStats();
        reportingAPI.expectRecentPdfAppStats(usage, 'visualization', 1);
        reportingAPI.expectRecentPdfAppStats(usage, 'dashboard', 1);
        reportingAPI.expectRecentPdfLayoutStats(usage, 'preserve_layout', 2);
        reportingAPI.expectRecentPdfLayoutStats(usage, 'print', 0);
        reportingAPI.expectRecentJobTypeTotalStats(usage, 'csv_searchsource', 0);
        reportingAPI.expectRecentJobTypeTotalStats(usage, 'printable_pdf', 2);
      });

      it('should handle print_layout pdf', async () => {
        await reportingAPI.expectAllJobsToFinishSuccessfully(
          await Promise.all([
            reportingAPI.postJob(GenerationUrls.PDF_PRINT_DASHBOARD_6_3),
            reportingAPI.postJob(
              GenerationUrls.PDF_PRINT_PIE_VISUALIZATION_FILTER_AND_SAVED_SEARCH_6_3
            ),
          ])
        );

        const usage = await usageAPI.getUsageStats();
        reportingAPI.expectRecentPdfAppStats(usage, 'visualization', 1);
        reportingAPI.expectRecentPdfAppStats(usage, 'dashboard', 1);
        reportingAPI.expectRecentPdfLayoutStats(usage, 'preserve_layout', 0);
        reportingAPI.expectRecentPdfLayoutStats(usage, 'print', 2);
        reportingAPI.expectRecentJobTypeTotalStats(usage, 'csv_searchsource', 0);
        reportingAPI.expectRecentJobTypeTotalStats(usage, 'printable_pdf', 2);

        reportingAPI.expectAllTimePdfAppStats(usage, 'visualization', 1);
        reportingAPI.expectAllTimePdfAppStats(usage, 'dashboard', 1);
        reportingAPI.expectAllTimePdfLayoutStats(usage, 'preserve_layout', 0);
        reportingAPI.expectAllTimePdfLayoutStats(usage, 'print', 2);
        reportingAPI.expectAllTimeJobTypeTotalStats(usage, 'csv_searchsource', 0);
        reportingAPI.expectAllTimeJobTypeTotalStats(usage, 'printable_pdf', 2);
      });
    });
  });
}
