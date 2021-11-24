/**
*
* @licstart  The following is the entire license notice for the JavaScript code in this file.
*
* Helmet record importer for the Melinda record batch import system
*
* Copyright (c) 2019 University Of Helsinki (The National Library Of Finland)
*
* This file is part of melinda-record-import-importer-helmet
*
* melinda-record-import-importer-helmet program is free software: you can redistribute it and/or modify
* it under the terms of the GNU Affero General Public License as
* published by the Free Software Foundation, either version 3 of the
* License, or (at your option) any later version.
*
* melinda-record-import-importer-helmet is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU Affero General Public License for more details.
*
* You should have received a copy of the GNU Affero General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*
* @licend  The above is the entire license notice
* for the JavaScript code in this file.
*
*/

import httpStatus from 'http-status';
import {MarcRecord} from '@natlibfi/marc-record';
import {getRecordTitle, getRecordStandardIdentifiers} from '@natlibfi/melinda-commons';
import {createLogger} from '@natlibfi/melinda-backend-commons';
import {RECORD_IMPORT_STATE} from '@natlibfi/melinda-record-import-commons';
import {createApiClient} from '@natlibfi/melinda-rest-api-client';
import {noopMelindaImport, catalogerId, restApiOptions, logLevel} from './config';

export default function () {
  const logger = createLogger(logLevel);
  const apiClient = createApiClient(restApiOptions);

  return async message => {
    const record = new MarcRecord(JSON.parse(message.content.toString()), {subfieldValues: false});
    logger.debug('Record data to be imported');
    logger.debug(JSON.stringify(record));
    const title = getRecordTitle(record);
    const standardIdentifiers = getRecordStandardIdentifiers(record);

    if (noopMelindaImport) {
      logger.info('NOOP set. Not importing anything');
      return {status: RECORD_IMPORT_STATE.SKIPPED, metadata: {title, standardIdentifiers}};
    }

    try {
      logger.info('Importing record to Melinda...');
      const {recordId: id} = await apiClient.create(record, {unique: 1, noop: 0, cataloger: catalogerId ? catalogerId : undefined});

      logger.info(`Created new record ${id}`);
      return {status: RECORD_IMPORT_STATE.CREATED, metadata: {id, title, standardIdentifiers}};
    } catch (error) {
      if (error.status) {
        if (error.status === httpStatus.CONFLICT) {
          return {status: RECORD_IMPORT_STATE.DUPLICATE, metadata: {matches: error.payload, title, standardIdentifiers}};
        }

        if (error.status === httpStatus.UNPROCESSABLE_ENTITY) {
          logger.error('Got expected unprosessable entity response');
          return {status: RECORD_IMPORT_STATE.INVALID, metadata: {validationMessages: error.payload, title, standardIdentifiers}};
        }

        if (error.status === httpStatus.FORBIDDEN) {
          logger.error('Got permission error response');
          return {status: RECORD_IMPORT_STATE.ERROR, metadata: {validationMessages: error.payload, title, standardIdentifiers}};
        }

        if (error.status === httpStatus.INTERNAL_SERVER_ERROR) {
          logger.error('Got expected internal server error response');
          return {status: RECORD_IMPORT_STATE.ERROR, metadata: {validationMessages: 'Invalid record data', title, standardIdentifiers}};
        }

        if (error.status === httpStatus.REQUEST_TIMEOUT) {
          logger.error('Got request timeout from server as response. Restarting importter!');
          throw new Error(`Melinda REST API Request timeout error: ${error.status} ${error.payload || ''}`);
        }

        logger.error('Unexpected error occured in rest api. Restarting importter!');
        throw new Error(`Melinda REST API error: ${error.status} ${error.payload || ''}`);
      }

      throw error;
    }
  };
}
