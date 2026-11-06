import { err, errAsync, ok, ResultAsync, type Result } from "neverthrow";

import type { WorkspaceState } from "./workspace-model";

const DB_NAME = "dumb-diagrams-studio";
const DB_VERSION = 1;
const STORE_NAME = "workspace";
const WORKSPACE_KEY = "current";
const FALLBACK_KEY = "dumb-diagrams:workspace";
const PENDING_WORKSPACE_KEY = "dumb-diagrams:workspace-pending";

export type WorkspacePersistenceOutcome = {
  status: "ok" | "degraded";
  warning?: string;
  errors?: readonly StorageError[];
};

export type StorageErrorCode = "unavailable" | "quota-exceeded" | "corrupt" | "transaction-failed";

export type StorageError = {
  readonly code: StorageErrorCode;
  readonly layer: "journal" | "indexeddb" | "fallback";
  readonly operation: "read" | "write" | "clear";
  readonly message: string;
  readonly cause: unknown;
  readonly relatedErrors?: readonly StorageError[];
};

export interface WorkspaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WorkspaceIndexedDb {
  read(key: string): ResultAsync<unknown | undefined, StorageError>;
  write(key: string, value: WorkspaceState): ResultAsync<void, StorageError>;
}

export interface WorkspacePersistencePlatform {
  journal: WorkspaceStorage;
  indexedDb: WorkspaceIndexedDb;
  fallback: WorkspaceStorage;
}

export type WorkspaceLoadOutcome = WorkspacePersistenceOutcome & {
  workspace: WorkspaceState | null;
};

export interface WorkspaceRestoreCodec {
  deserialize(raw: string): WorkspaceState | null;
  normalize(value: unknown): WorkspaceState | null;
  validate(workspace: WorkspaceState): WorkspaceState | null;
}

export function loadPersistedWorkspace(
  platform: WorkspacePersistencePlatform,
  codec: WorkspaceRestoreCodec,
): ResultAsync<WorkspaceLoadOutcome, StorageError> {
  return ResultAsync.fromPromise(readPersistedWorkspace(platform, codec), (cause) =>
    storageError("indexeddb", "read", cause),
  ).andThen((result) => result);
}

async function readPersistedWorkspace(
  platform: WorkspacePersistencePlatform,
  codec: WorkspaceRestoreCodec,
): Promise<Result<WorkspaceLoadOutcome, StorageError>> {
  const warnings: string[] = [];
  const errors: StorageError[] = [];
  let failedSources = 0;
  const addFailure = (error: StorageError) => {
    failedSources += 1;
    errors.push(error);
    warnings.push(storageWarning(error));
  };

  const journal = readStorage(platform.journal, PENDING_WORKSPACE_KEY, "journal");
  if (journal.isErr()) {
    addFailure(journal.error);
  } else if (journal.value !== undefined) {
    const restored = restoreSerializedWorkspace(journal.value, "journal", codec);
    if (restored.isOk()) return ok(persistenceLoadResult(restored.value, warnings, errors));
    failedSources += 1;
    errors.push(restored.error);
    warnings.push(storageWarning(restored.error));
  }

  const database = await readIndexedDb(platform.indexedDb);
  if (database.isErr()) {
    addFailure(database.error);
  } else if (database.value !== undefined) {
    const restored = restoreWorkspaceValue(database.value, "indexeddb", codec);
    if (restored.isOk()) return ok(persistenceLoadResult(restored.value, warnings, errors));
    failedSources += 1;
    errors.push(restored.error);
    warnings.push(storageWarning(restored.error));
  }

  const fallback = readStorage(platform.fallback, FALLBACK_KEY, "fallback");
  if (fallback.isErr()) {
    addFailure(fallback.error);
  } else if (fallback.value !== undefined) {
    const restored = restoreSerializedWorkspace(fallback.value, "fallback", codec);
    if (restored.isOk()) return ok(persistenceLoadResult(restored.value, warnings, errors));
    failedSources += 1;
    errors.push(restored.error);
    warnings.push(storageWarning(restored.error));
  }

  if (failedSources === 3) return err(combineStorageErrors(errors));
  if (!warnings.length && failedSources === 0) return ok({ status: "ok", workspace: null });
  return ok({
    status: "degraded",
    workspace: null,
    warning: warnings[0] ?? "Local workspace persistence is unavailable; starting with a local workspace.",
    errors,
  });
}

function persistenceLoadResult(
  workspace: WorkspaceState,
  warnings: string[],
  errors: StorageError[],
): WorkspaceLoadOutcome {
  return warnings.length
    ? { status: "degraded", workspace, warning: warnings[0], errors }
    : { status: "ok", workspace };
}

function restoreSerializedWorkspace(
  raw: string,
  layer: StorageError["layer"],
  codec: WorkspaceRestoreCodec,
): Result<WorkspaceState, StorageError> {
  const normalized = codec.deserialize(raw);
  const restored = normalized ? codec.validate(normalized) : null;
  return restored ? ok(restored) : err(corruptStorageError(layer, raw));
}

function restoreWorkspaceValue(
  value: unknown,
  layer: StorageError["layer"],
  codec: WorkspaceRestoreCodec,
): Result<WorkspaceState, StorageError> {
  const normalized = codec.normalize(value);
  const restored = normalized ? codec.validate(normalized) : null;
  return restored ? ok(restored) : err(corruptStorageError(layer, value));
}

export function persistWorkspaceJournal(
  serialized: string,
  platform: WorkspacePersistencePlatform,
): Result<void, StorageError> {
  const result = writeStorage(platform.journal, PENDING_WORKSPACE_KEY, serialized, "journal");
  if (result.isOk()) return result;
  try {
    platform.journal.removeItem(PENDING_WORKSPACE_KEY);
  } catch {
    // Storage may be completely disabled; the durable/fallback write still runs.
  }
  return result;
}

export function persistWorkspace(
  workspace: WorkspaceState,
  serialized: string,
  platform: WorkspacePersistencePlatform,
  journalResult?: Result<void, StorageError>,
): ResultAsync<WorkspacePersistenceOutcome, StorageError> {
  const journal = journalResult ?? persistWorkspaceJournal(serialized, platform);
  return ResultAsync.fromPromise(persistWorkspaceValue(workspace, serialized, platform, journal), (cause) =>
    storageError("indexeddb", "write", cause),
  ).andThen((result) => result);
}

async function persistWorkspaceValue(
  workspace: WorkspaceState,
  serialized: string,
  platform: WorkspacePersistencePlatform,
  journal: Result<void, StorageError>,
): Promise<Result<WorkspacePersistenceOutcome, StorageError>> {
  const journalError = journal.isErr() ? journal.error : undefined;

  const database = await writeIndexedDb(platform.indexedDb, workspace);
  if (database.isOk()) {
    const clear = clearJournalIfCurrent(platform.journal, serialized);
    if (clear.isErr()) {
      return ok({
        status: "degraded",
        warning: storageWarning(clear.error),
        errors: journalError ? [journalError, clear.error] : [clear.error],
      });
    }
    return ok(
      journalError
        ? { status: "degraded", warning: storageWarning(journalError), errors: [journalError] }
        : { status: "ok" },
    );
  }

  const fallback = writeStorage(platform.fallback, FALLBACK_KEY, serialized, "fallback");
  if (fallback.isOk()) {
    return ok({
      status: "degraded",
      warning: "IndexedDB workspace persistence is unavailable; using recovery storage.",
      errors: journalError ? [journalError, database.error] : [database.error],
    });
  }
  return err({
    ...fallback.error,
    message: "IndexedDB and recovery storage failed.",
    relatedErrors: journalError ? [journalError, database.error] : [database.error],
  });
}

function readStorage(
  storage: WorkspaceStorage,
  key: string,
  layer: StorageError["layer"],
): Result<string | undefined, StorageError> {
  try {
    const value = storage.getItem(key);
    return ok(value === null ? undefined : value);
  } catch (cause) {
    return err(storageError(layer, "read", cause));
  }
}

function writeStorage(
  storage: WorkspaceStorage,
  key: string,
  value: string,
  layer: StorageError["layer"],
): Result<void, StorageError> {
  try {
    storage.setItem(key, value);
    return ok(undefined);
  } catch (cause) {
    return err(storageError(layer, "write", cause));
  }
}

function clearJournalIfCurrent(storage: WorkspaceStorage, serialized: string): Result<void, StorageError> {
  const current = readStorage(storage, PENDING_WORKSPACE_KEY, "journal");
  if (current.isErr()) return err(current.error);
  if (current.value !== serialized) return ok(undefined);
  try {
    storage.removeItem(PENDING_WORKSPACE_KEY);
    return ok(undefined);
  } catch (cause) {
    return err(storageError("journal", "clear", cause));
  }
}

function readIndexedDb(indexedDb: WorkspaceIndexedDb): ResultAsync<unknown | undefined, StorageError> {
  return ResultAsync.fromPromise(
    Promise.resolve().then(() => indexedDb.read(WORKSPACE_KEY)),
    (cause) => storageError("indexeddb", "read", cause),
  ).andThen((result) => result);
}

function writeIndexedDb(indexedDb: WorkspaceIndexedDb, workspace: WorkspaceState): ResultAsync<void, StorageError> {
  return ResultAsync.fromPromise(
    Promise.resolve().then(() => indexedDb.write(WORKSPACE_KEY, workspace)),
    (cause) => storageError("indexeddb", "write", cause),
  ).andThen((result) => result);
}

function storageError(
  layer: StorageError["layer"],
  operation: StorageError["operation"],
  cause: unknown,
): StorageError {
  const text = cause instanceof Error ? `${cause.name} ${cause.message}` : String(cause);
  const quota = /quota|storage.?full|exceed/i.test(text);
  const transaction = layer === "indexeddb" && /transaction|abort|indexeddb/i.test(text);
  return {
    code: quota ? "quota-exceeded" : transaction ? "transaction-failed" : "unavailable",
    layer,
    operation,
    message: text,
    cause,
  };
}

function combineStorageErrors(errors: readonly StorageError[]): StorageError {
  const [first, ...related] = errors;
  if (!first) return storageError("indexeddb", "read", new Error("No workspace storage source was available."));
  return {
    ...first,
    message: "All workspace storage sources failed.",
    relatedErrors: [...(first.relatedErrors ?? []), ...related],
  };
}

export function storageWarning(error: StorageError): string {
  if (error.code === "corrupt") {
    if (error.layer === "journal") return "The latest workspace recovery snapshot was unreadable.";
    if (error.layer === "indexeddb")
      return "The stored workspace could not be restored; starting with a local workspace.";
    return "The fallback workspace could not be restored; starting with a local workspace.";
  }
  if (error.layer === "journal") return "Workspace recovery storage is unavailable; trying other local storage.";
  if (error.layer === "indexeddb") return "IndexedDB workspace persistence is unavailable; trying recovery storage.";
  return "Local workspace persistence is unavailable; edits may not survive reload.";
}

function corruptStorageError(layer: StorageError["layer"], value: unknown): StorageError {
  return {
    code: "corrupt",
    layer,
    operation: "read",
    message: "Persisted workspace data is malformed or failed validation.",
    cause: value,
  };
}

export function createDefaultPersistencePlatform(): WorkspacePersistencePlatform {
  const browserStorage: WorkspaceStorage = {
    getItem: (key) => globalThis.localStorage.getItem(key),
    setItem: (key, value) => globalThis.localStorage.setItem(key, value),
    removeItem: (key) => globalThis.localStorage.removeItem(key),
  };
  return {
    journal: browserStorage,
    fallback: browserStorage,
    indexedDb: {
      read: readDefaultIndexedDb,
      write: writeDefaultIndexedDb,
    },
  };
}

function openDatabase(operation: "read" | "write"): ResultAsync<IDBDatabase, StorageError> {
  if (typeof globalThis.indexedDB === "undefined") {
    const cause = new Error("IndexedDB is unavailable.");
    return errAsync({
      code: "unavailable",
      layer: "indexeddb",
      operation,
      message: `${cause.name} ${cause.message}`,
      cause,
    });
  }
  return ResultAsync.fromPromise(
    new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to open workspace storage."));
    }),
    (cause) => storageError("indexeddb", operation, cause),
  );
}

function readDefaultIndexedDb(key: string): ResultAsync<unknown | undefined, StorageError> {
  return openDatabase("read").andThen((db) =>
    ResultAsync.fromPromise(
      (async () => {
        try {
          return await readWorkspaceValue(db, key);
        } finally {
          db.close();
        }
      })(),
      (cause) => storageError("indexeddb", "read", cause),
    ),
  );
}

function writeDefaultIndexedDb(key: string, workspace: WorkspaceState): ResultAsync<void, StorageError> {
  return openDatabase("write").andThen((db) =>
    ResultAsync.fromPromise(
      (async () => {
        try {
          await writeWorkspaceValue(db, key, workspace);
        } finally {
          db.close();
        }
      })(),
      (cause) => storageError("indexeddb", "write", cause),
    ),
  );
}

function readWorkspaceValue(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    let value: unknown;
    request.onsuccess = () => {
      value = request.result;
    };
    request.onerror = () => reject(request.error ?? new Error("Workspace read failed."));
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => reject(transaction.error ?? new Error("Workspace read transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Workspace read transaction aborted."));
  });
}

function writeWorkspaceValue(db: IDBDatabase, key: string, workspace: WorkspaceState): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    try {
      transaction.objectStore(STORE_NAME).put(workspace, key);
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Workspace write transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Workspace write transaction aborted."));
  });
}
