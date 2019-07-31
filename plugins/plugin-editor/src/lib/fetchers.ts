/*
 * Copyright 2018-19 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as Debug from 'debug'

import { basename, dirname } from 'path'
import { lstat, readFile, mkdir, writeFile } from 'fs'

import expandHomeDir from '@kui-shell/core/util/home'
import { findFile } from '@kui-shell/core/core/find-file'
import { MetadataBearing } from '@kui-shell/core/models/entity'

import { persisters } from './persisters'
const debug = Debug('plugins/editor/fetchers')

/** allows us to reassign a string code to a numeric one */
interface ErrorWithAnyCode extends Error {
  code: any // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface ExecSpec {
  kind: string
  code: string
}

interface KeyValuePair {
  key: string
  value: string
}

interface Getter {
  getEntity: () => object
}

export interface Entity extends MetadataBearing {
  type: string
  name: string
  viewName?: string
  extractName?: (raw: string) => string // re-extract name from raw source, e.g. after a save or revert
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lock?: any // set to false if you don't want a lock icon
  filepath?: string
  exec: ExecSpec
  persister: any // eslint-disable-line @typescript-eslint/no-explicit-any
  gotoReadonlyView?: (Getter) => any // eslint-disable-line @typescript-eslint/no-explicit-any
  annotations: KeyValuePair[]
}

export type IFetcher = (name: string, parsedOptions?, execOptions?) => Promise<Entity>

/**
 * Register an entity fetcher for a given entity kind
 *
 */
const fetchers = []
export const registerFetcher = (fetcher: IFetcher): void => {
  debug('registerFetcher')
  fetchers.push({ fetcher })
}

/**
 * See if we one of the registered entity fetchers knows how to fetch
 * the text for the given named entity
 *
 */
export const fetchEntity = async (name: string, parsedOptions, execOptions): Promise<Entity> => {
  let lastError
  for (let idx = 0; idx < fetchers.length; idx++) {
    const { fetcher } = fetchers[idx]

    try {
      const entity = await fetcher(name, parsedOptions, execOptions)
      if (entity) {
        return entity
      }
    } catch (err) {
      debug('got error from fetcher', err)
      if (!lastError || (err.code && err.code !== 404)) {
        lastError = err
      }
      if (parsedOptions.create) {
          // This seems a little arbitrary but we need to break up hot-potato act between the editor and editor-extensions plugins
          // In a create situation the user is expecting the local file system fetcher to act alone.  If it fails, that should be it.
          throw lastError
      }
    }
  }

  if (lastError) {
    throw lastError
  }
}

/**
 * Read a local file, optionally creating it
 *
 */
export const fetchFile: IFetcher = (name: string, parsedOptions) => {
  debug('fetching local file', name)
  const create = parsedOptions && parsedOptions.create

  return new Promise<Entity>((resolve, reject) => {
    const filepath = findFile(expandHomeDir(name))

    lstat(filepath, (err2: ErrorWithAnyCode, stats) => {
      if (err2) {
        if (err2.code === 'ENOENT') {
            debug('file does not exist')
            if (create) {   
                debug('creation requested')
                return resolve(createFile(name))
            }
            err2.code = 404
        }
        reject(err2)
      } else if (create) {
        reject(new Error(`${name} cannot be created because it already exists`))
      } else if (!stats.isDirectory) {
        const error = new Error('Specified file is a directory')
        reject(error)
      } else {
        debug("normal read, file exists, create not requested")
        readFile(filepath, (err, data) => {
          if (err) {
            reject(err)
          } else {
            const extension = name.substring(name.lastIndexOf('.') + 1)
            const kind =
              extension === 'js'
                ? 'javascript'
                : extension === 'ts'
                ? 'typescript'
                : extension === 'py'
                ? 'python'
                : extension

            resolve({
              type: 'file',
              name: basename(name),
              filepath,
              exec: {
                kind,
                code: data.toString()
              },
              annotations: [],
              persister: persisters.files
            })
          }
        })
      }
    })
  })
}

// Creates parent directories if needed, then creates a file then edits it
async function createFile(name: string) {
    const dir = dirname(name)
    const base = basename(name)
    if (base != name) {
        await makeDirs(dir);
        return await createAndFetch(name);
    } else {
        return createAndFetch(name)
    }
}

// Recursively make a directory, ignoring failure
function makeDirs(dir: string) {
    return new Promise(function(resolve) {
         mkdir(dir, { recursive: true }, () => {
             // Ignore any error on the mkdir
             resolve(undefined)
         })
    })
}

// Create a file then fetch it
function createAndFetch(name: string) {
    return new Promise(function(resolve, reject) {
        writeFile(name, "", (err) => {
            if (err) {
                reject(err)
            } else {
                resolve(undefined)
            }
        })
    }).then(() => fetchFile(name))
}

/* register the built-in local file fetcher */
registerFetcher(fetchFile)
