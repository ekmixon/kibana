/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { openSync, writeSync, unlinkSync, closeSync } from 'fs';
import { dirname } from 'path';

import chalk from 'chalk';
import { createHash } from 'crypto';
import Axios from 'axios';
import { ToolingLog } from '@kbn/dev-utils';

// https://github.com/axios/axios/tree/ffea03453f77a8176c51554d5f6c3c6829294649/lib/adapters
// @ts-expect-error untyped internal module used to prevent axios from using xhr adapter in tests
import AxiosHttpAdapter from 'axios/lib/adapters/http';

import { mkdirp } from './fs';

function tryUnlink(path: string) {
  try {
    unlinkSync(path);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

interface DownloadOptions {
  log: ToolingLog;
  url: string;
  destination: string;
  shaChecksum: string;
  shaAlgorithm: string;
  retries?: number;
}
export async function download(options: DownloadOptions): Promise<void> {
  const { log, url, destination, shaChecksum, shaAlgorithm, retries = 0 } = options;

  if (!shaChecksum) {
    throw new Error(`${shaAlgorithm} checksum of ${url} not provided, refusing to download.`);
  }

  // mkdirp and open file outside of try/catch, we don't retry for those errors
  await mkdirp(dirname(destination));
  const fileHandle = openSync(destination, 'w');

  let error;
  try {
    log.debug(`Attempting download of ${url}`, chalk.dim(shaAlgorithm));

    const response = await Axios.request({
      url,
      responseType: 'stream',
      adapter: AxiosHttpAdapter,
    });

    if (response.status !== 200) {
      throw new Error(`Unexpected status code ${response.status} when downloading ${url}`);
    }

    const hash = createHash(shaAlgorithm);
    await new Promise((resolve, reject) => {
      response.data.on('data', (chunk: Buffer) => {
        hash.update(chunk);
        writeSync(fileHandle, chunk);
      });

      response.data.on('error', reject);
      response.data.on('end', resolve);
    });

    const downloadedSha = hash.digest('hex');
    if (downloadedSha !== shaChecksum) {
      throw new Error(
        `Downloaded checksum ${downloadedSha} does not match the expected ${shaAlgorithm} checksum.`
      );
    }
  } catch (_error) {
    error = _error;
  } finally {
    closeSync(fileHandle);
  }

  if (!error) {
    log.debug(`Downloaded ${url} and verified checksum`);
    return;
  }

  log.debug(`Download failed: ${error.message}`);

  // cleanup downloaded data and log error
  log.debug(`Deleting downloaded data at ${destination}`);
  tryUnlink(destination);

  // retry if we have retries left
  if (retries > 0) {
    log.debug(`Retrying - ${retries} attempt remaining`);
    return await download({
      ...options,
      retries: retries - 1,
    });
  }

  throw error;
}
