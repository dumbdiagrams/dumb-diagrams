import { describe, expect, it, vi } from "vitest";
import { errAsync, okAsync } from "neverthrow";

import {
  createDefaultPersistencePlatform,
  loadPersistedWorkspace,
  type StorageError,
  type WorkspacePersistencePlatform,
  type WorkspaceStorage,
} from "./workspace-persistence";
import type { WorkspaceState } from "./workspace-model";

describe("default workspace persistence platform", () => {
  it("returns a typed error when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);

    try {
      const platform = createDefaultPersistencePlatform();
      const read = await platform.indexedDb.read("current");
      const write = await platform.indexedDb.write("current", {} as WorkspaceState);

      expect(read.isErr()).toBe(true);
      expect(read._unsafeUnwrapErr()).toMatchObject({
        code: "unavailable",
        layer: "indexeddb",
        operation: "read",
        message: "Error IndexedDB is unavailable.",
      });
      expect(write.isErr()).toBe(true);
      expect(write._unsafeUnwrapErr()).toMatchObject({
        code: "unavailable",
        layer: "indexeddb",
        operation: "write",
        message: "Error IndexedDB is unavailable.",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("closes the database when a read transaction fails", async () => {
    let closed = 0;
    const transactionError = new Error("transaction aborted");
    type FakeRequest = {
      error: Error | null;
      result: unknown;
      onerror?: (() => void) | null;
      onsuccess?: (() => void) | null;
      onupgradeneeded?: (() => void) | null;
    };
    type FakeTransaction = {
      error: Error | null;
      onabort?: (() => void) | null;
      oncomplete?: (() => void) | null;
      onerror?: (() => void) | null;
      objectStore: () => { get: () => FakeRequest };
    };

    const request: FakeRequest = { error: null, result: undefined };
    const transaction: FakeTransaction = {
      error: transactionError,
      objectStore: () => ({ get: () => request }),
    };
    const database = {
      close: () => { closed += 1; },
      transaction: () => {
        queueMicrotask(() => transaction.onabort?.());
        return transaction;
      },
    } as unknown as IDBDatabase;
    const indexedDB = {
      open: () => {
        const openRequest: FakeRequest = { error: null, result: database };
        queueMicrotask(() => openRequest.onsuccess?.());
        return openRequest;
      },
    } as unknown as IDBFactory;

    vi.stubGlobal("indexedDB", indexedDB);
    try {
      const result = await createDefaultPersistencePlatform().indexedDb.read("current");

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toMatchObject({ code: "transaction-failed", operation: "read" });
      expect(closed).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("preserves typed IndexedDB errors from an injected platform", async () => {
    const storage: WorkspaceStorage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    const typedError: StorageError = {
      code: "transaction-failed",
      layer: "indexeddb",
      operation: "read",
      message: "already classified",
      cause: new Error("transaction aborted"),
    };
    const platform: WorkspacePersistencePlatform = {
      journal: storage,
      fallback: storage,
      indexedDb: {
        read: () => errAsync(typedError),
        write: () => okAsync(undefined),
      },
    };

    const result = await loadPersistedWorkspace(platform, {
      deserialize: () => null,
      normalize: () => null,
      validate: (workspace) => workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().errors?.[0]).toBe(typedError);
  });
});
