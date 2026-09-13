/**
 * Loads the project's env files regardless of the working directory.
 *
 * These scripts used to read '.env.local' as a bare relative path, so they only
 * worked when run from the project root and failed with a bare ENOENT anywhere
 * else. Resolving from this file's own location makes them runnable from
 * anywhere, which matters when they are invoked from a parent directory or a
 * CI step.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, isAbsolute } from 'node:path'

export const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

export function loadEnv(...files) {
  const list = files.length ? files : ['.env.local', '.env']
  for (const f of list) {
    try {
      const path = isAbsolute(f) ? f : join(projectRoot, f)
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
      }
    } catch {
      /* each file is optional */
    }
  }
  return process.env
}

/** Read a value the loader does not put in the environment (e.g. a comment). */
export function readEnvFile(file) {
  const path = isAbsolute(file) ? file : join(projectRoot, file)
  return readFileSync(path, 'utf8')
}
