/**
 * The one database, opened once.
 *
 * Local storage holds the working copy and nothing else now: it is synchronous,
 * which is what lets a session open on the shot it closed on without waiting for
 * anything, and it caps around five megabytes, which is fine for a document and
 * hopeless for a video. So the bytes live here instead — IndexedDB stores real
 * `Blob`s, has a quota measured in gigabytes, and never asks for base64.
 *
 * Deliberately hand-rolled rather than wrapped in a library. Two object stores
 * and four operations do not need one, and the whole point of the lab running
 * entirely in the browser is that it carries nothing it does not use.
 */

const NAME = 'render-labs'
const VERSION = 1

export const ASSETS = 'assets'
export const PROJECTS = 'projects'

let handle: Promise<IDBDatabase> | null = null

export function db(): Promise<IDBDatabase> {
  // Cached as the promise, not the database: two calls during the same tick
  // would otherwise both open a connection and the second would win a race
  // nobody needed to run.
  handle ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(NAME, VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      // Content-addressed, so the key is the hash and there is nothing to index.
      if (!database.objectStoreNames.contains(ASSETS)) database.createObjectStore(ASSETS, { keyPath: 'id' })
      if (!database.objectStoreNames.contains(PROJECTS)) {
        const store = database.createObjectStore(PROJECTS, { keyPath: 'id' })
        // The list is always shown most-recent first, which is an index rather
        // than a sort over every record every time the sheet opens.
        store.createIndex('savedAt', 'savedAt')
      }
    }

    request.onsuccess = () => {
      const database = request.result
      // Another tab upgrading is the only thing that closes this connection out
      // from under us. Dropping the cache means the next call reopens rather
      // than handing out a database that will reject everything.
      database.onclose = () => {
        handle = null
      }
      database.onversionchange = () => {
        database.close()
        handle = null
      }
      resolve(database)
    }

    request.onerror = () => reject(request.error ?? new Error('IndexedDB is unavailable.'))
    // Firefox in private mode resolves neither, so nothing here can hang a
    // caller that does not want to wait — every call site treats a rejection as
    // "no storage" and carries on.
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab.'))
  }).catch((cause: unknown) => {
    handle = null
    throw cause
  })

  return handle
}

/** Run one request against one store and resolve with its result. */
export async function request<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const database = await db()
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(store, mode)
    const query = run(transaction.objectStore(store))
    query.onsuccess = () => resolve(query.result as T)
    // Both, and not just the request: a write can succeed and its transaction
    // still fail on commit when the quota is reached, and a caller told the put
    // worked would report a save that is not there on the next reload.
    query.onerror = () => reject(query.error ?? new Error('Request failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted.'))
  })
}

/** Every record in a store, newest first when the store keeps a `savedAt`. */
export async function all<T>(store: string): Promise<T[]> {
  const records = await request<T[]>(store, 'readonly', target => target.getAll())
  return records
}

export async function put<T>(store: string, value: T): Promise<void> {
  await request(store, 'readwrite', target => target.put(value))
}

export async function get<T>(store: string, key: string): Promise<T | undefined> {
  return request<T | undefined>(store, 'readonly', target => target.get(key))
}

export async function remove(store: string, key: string): Promise<void> {
  await request(store, 'readwrite', target => target.delete(key))
}

/**
 * Ask for the storage to be exempt from automatic eviction.
 *
 * Without this an origin's data is "best effort": Chrome may clear it when the
 * disk gets tight, and a project the person expected to still be there is not.
 * Granted on engagement rather than on asking, so this is a request and not a
 * guarantee — which is exactly why an exported file, and not this, is what the
 * lab tells people to keep.
 *
 * Asked at the first save rather than on load: permission questions belong at
 * the moment somebody commits to something, not on arrival.
 */
export async function persist(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

/**
 * How much room is left, when the browser will say.
 *
 * Used to warn before an import fails rather than after: a video that cannot be
 * stored is better refused with a number than accepted and lost.
 */
export async function storageEstimate(): Promise<{ usage: number, quota: number } | null> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (!estimate || estimate.quota === undefined || estimate.usage === undefined) return null
    return { usage: estimate.usage, quota: estimate.quota }
  } catch {
    return null
  }
}
