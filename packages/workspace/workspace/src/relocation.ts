/** Startup metadata relocation over host-retained aliases; session logs remain immutable. */
import { stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { WorkspaceRecord } from './spec.ts'
import type { WorkspaceId, WorkspacePathRelocation } from './types.ts'
import { fullyQualifiedWorkspacePath, realpathNormalize } from './paths.ts'

async function resolveRelocations(relocations: readonly WorkspacePathRelocation[]): Promise<ReadonlyMap<string, string>> {
  const paths = new Map<string, string>()
  for (const { from, to } of relocations) {
    if (!fullyQualifiedWorkspacePath(from) || !fullyQualifiedWorkspacePath(to)) {
      throw new Error('workspace relocation requires fully qualified paths')
    }
    const key = resolve(from)
    if (paths.has(key)) throw new Error(`workspace relocation repeats source '${from}'`)
    const target = await realpathNormalize(to)
    if (!(await stat(target)).isDirectory() || await realpathNormalize(from) !== target) {
      throw new Error(`workspace relocation '${from}' must resolve to the destination directory '${to}'`)
    }
    paths.set(key, target)
  }
  return paths
}

async function relocatedPath(path: string, paths: ReadonlyMap<string, string>): Promise<string> {
  const candidates = [...paths].filter(([from]) => {
    const suffix = relative(from, path)
    return suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`))
  }).sort(([left], [right]) => right.length - left.length)
  const match = candidates[0]
  if (match === undefined) return path
  const [from, to] = match
  const target = join(to, relative(from, path))
  if (await realpathNormalize(path) !== target || !(await stat(target)).isDirectory()) {
    throw new Error(`workspace relocation '${path}' does not resolve to '${target}'`)
  }
  return target
}

/**
 * Reconcile only named workspace paths before the registry publishes its entities.
 * All effective paths are checked for collisions before any write. Individual
 * record puts are atomic; restart skips committed records and resumes the rest.
 * @param table - Validated workspace table, before header indexing or entity publication.
 * @param relocations - Physical relocations with retained aliases owned by the host.
 * @returns Resolution after every affected record is durable; no session log is opened.
 */
export async function relocateWorkspacePaths(
  table: KvTable<WorkspaceId, WorkspaceRecord>,
  relocations: readonly WorkspacePathRelocation[],
): Promise<void> {
  if (relocations.length === 0) return
  const paths = await resolveRelocations(relocations)
  const entries = await Promise.all([...table.entries()].map(async ([id, record]) => ({
    id, record, path: await relocatedPath(record.path, paths),
  })))
  const unique = new Set<string>()
  for (const { path } of entries) {
    if (unique.has(path)) throw new Error(`workspace relocation would merge distinct workspace records at '${path}'`)
    unique.add(path)
  }
  for (const { id, record, path } of entries) {
    if (path === record.path) continue
    await table.put(id, { ...record, path, updatedAt: new Date().toISOString() })
  }
}
