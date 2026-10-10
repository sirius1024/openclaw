import type { AgentDatabaseRegistryChange } from "../../state/openclaw-agent-db-contract.js";
import { prepareOpenClawAgentDatabaseRegistrySnapshotRead } from "../../state/openclaw-agent-db-registry-listing.js";
import { assertSessionStoreReadCandidate } from "./session-store-read-candidates.js";
import type {
  SessionStoreTargetInventoryRequest,
  SessionStoreTargetInventoryResult,
  SessionStoreTargetReadRequest,
  SessionStoreTargetReadResult,
} from "./session-store-target-inventory.js";
import {
  targetDiscoveryLane,
  withSessionHistoryWorkerReadCandidates,
} from "./session-transcript-worker-resources.js";

type PreparedStoreTarget = Extract<SessionStoreTargetReadResult, { kind: "session-store-target" }>;
type StoreTargetReadOwner = {
  assertCurrent: () => void;
  onRegistryChange: (change: AgentDatabaseRegistryChange) => void;
  refreshBeforeDispatch: (assertRetainedTarget: () => void) => Promise<void>;
  revalidateTarget: () => Promise<void>;
};

export function prepareSessionStoreTargetInventoryRead(
  request: Omit<SessionStoreTargetInventoryRequest, "registeredDatabases">,
  unchangedBy?: Parameters<typeof prepareOpenClawAgentDatabaseRegistrySnapshotRead>[1],
) {
  const { candidates, ...prepared } = request;
  // Security-scoped inventories can supply a stricter witness. Ordinary discovery
  // keeps its selected registry snapshot; later registrations affect the next read.
  const registry = prepareOpenClawAgentDatabaseRegistrySnapshotRead(
    { env: request.env },
    unchangedBy,
  );
  const assertRegistryCurrent = unchangedBy
    ? registry.assertCurrent
    : registry.assertAdmissionCurrent;
  return {
    assertRegistryCurrent,
    withRead<T>(
      operation: (
        inventory: Extract<SessionStoreTargetInventoryResult, { kind: "session-target-inventory" }>,
        assertCurrent: () => void,
      ) => Promise<T>,
      assertCallerCurrent?: () => void,
    ) {
      return withSessionHistoryWorkerReadCandidates(
        candidates,
        async (discovery) => {
          const assertCurrent = () => {
            assertCallerCurrent?.();
            discovery.assertCurrent();
            assertRegistryCurrent();
          };
          let inventory = await discovery.readTargetInventory({
            ...prepared,
            registeredDatabases: { status: "deferred" },
          });
          if (inventory.kind === "session-target-registry-required") {
            const { result } = await registry.read();
            inventory = await discovery.readTargetInventory({
              ...prepared,
              registeredDatabases:
                result.status === "available" ? result.entries : { status: "unavailable" },
            });
          }
          assertCurrent();
          if (inventory.kind !== "session-target-inventory") {
            throw new Error("Session store inventory requested registry rows twice");
          }
          return operation(inventory, assertCurrent);
        },
        targetDiscoveryLane,
      );
    },
  };
}

export async function withSessionStoreTarget<T>(
  request: Omit<SessionStoreTargetReadRequest, "registeredDatabases">,
  operation: (target: PreparedStoreTarget, owner: StoreTargetReadOwner) => Promise<T>,
  assertCallerCurrent?: () => void,
  onReadError?: (error: unknown, assertCurrent: () => void) => Promise<T>,
): Promise<T> {
  assertCallerCurrent?.();
  const { candidates, ...targetRequest } = request;
  const registry = prepareOpenClawAgentDatabaseRegistrySnapshotRead({ env: request.env });
  return withSessionHistoryWorkerReadCandidates(
    candidates,
    async (discovery) => {
      const assertCurrent = () => {
        assertCallerCurrent?.();
        registry.assertAdmissionCurrent();
        discovery.assertCurrent();
      };
      let read = await discovery.readStoreTargetResult({
        ...targetRequest,
        registeredDatabases: { status: "deferred" },
      });
      if (read.ok && read.value.kind === "session-target-registry-required") {
        const { result } = await registry.read();
        read = await discovery.readStoreTargetResult({
          ...targetRequest,
          registeredDatabases:
            result.status === "available" ? result.entries : { status: "unavailable" },
        });
      }
      assertCurrent();
      if (!read.ok) {
        if (onReadError) {
          return onReadError(read.error, assertCurrent);
        }
        throw read.error;
      }
      if (read.value.kind === "session-target-registry-required") {
        throw new Error("Session store target requested registry rows twice");
      }
      const target = read.value;
      const assertTargetCurrent = () => {
        assertCurrent();
        assertSessionStoreReadCandidate(target.sourcePath, candidates);
      };
      return operation(target, {
        assertCurrent: assertTargetCurrent,
        // A registration does not retarget an operation already bound to a physical store.
        onRegistryChange: assertTargetCurrent,
        async refreshBeforeDispatch(assertRetainedTarget) {
          assertRetainedTarget();
          assertTargetCurrent();
        },
        async revalidateTarget() {
          assertTargetCurrent();
        },
      });
    },
    targetDiscoveryLane,
  );
}
