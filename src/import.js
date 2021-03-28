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
import {noopMelindaImport, restApiOptions, logLevel} from './config';

export default function () {
  const logger = createLogger(logLevel);
  const apiClient = createApiClient(restApiOptions);

  return async message => {
    const record = new MarcRecord(JSON.parse(message.content.toString()), {subfieldValues: false});
    const [f001] = record.get('001');
    const UPDATE = f001.value !== undefined;
    const title = getRecordTitle(record);
    const standardIdentifiers = getRecordStandardIdentifiers(record);

    if (noopMelindaImport) {
      logger.log('info', 'NOOP set. Not importing anything');
      return {status: RECORD_IMPORT_STATE.SKIPPED, metadata: {title, standardIdentifiers}};
    }

    try {
      logger.log('info', 'Importing record to Melinda...');
      if (UPDATE) {
        const {recordId: id} = await apiClient.create(record, {unique: true});
        logger.log('info', `Created new record ${id}`);
        return {status: RECORD_IMPORT_STATE.CREATED, metadata: {id, title, standardIdentifiers}};
      }

      const {payload: id} = await apiClient.update(record, f001.value);
      logger.log('info', `Updated record ${id}`);
      return {status: RECORD_IMPORT_STATE.UPDATED, metadata: {id, title, standardIdentifiers}};

    } catch (err) {
      if (err.status) {
        if (err.status === httpStatus.CONFLICT) {
          logger.log('error', 'Got expected conflict response');
          return {status: RECORD_IMPORT_STATE.DUPLICATE, metadata: {matches: err.payload, title, standardIdentifiers}};
        }

        if (error.status === httpStatus.UNPROCESSABLE_ENTITY) {
          logger.log('error', 'Got expected unprosessable entity response');
          return {status: RECORD_IMPORT_STATE.INVALID, metadata: {validationMessages: error.payload, title, standardIdentifiers}};
        }

        if (error.status === httpStatus.FORBIDDEN) {
          logger.log('error', 'Got expected unprosessable entity response');
          return {status: RECORD_IMPORT_STATE.INVALID, metadata: {validationMessages: error.payload, title, standardIdentifiers}};
        }

        throw new Error(`Melinda REST API error: ${err.status} ${err.payload || ''}`);
      }

      throw err;
    }
  };
}
