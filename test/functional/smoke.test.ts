import { describe, it, expect } from "vitest";
import { registerTestUser } from "../harness/users";
import { createTestClient, stopTestClient } from "../harness/clients";
import { waitFor } from "../harness/waitFor";

describe("smoke", () => {
  it("two users, create tree, invite, join", async () => {
    const aliceUser = await registerTestUser("alice");
    const bobUser = await registerTestUser("bob");

    const alice = await createTestClient(aliceUser);
    const bob = await createTestClient(bobUser);

    try {
      const tree = await alice.unstableCreateFileTree("smoke");
      expect(tree.id).toBeTruthy();
      expect(typeof tree.id).toBe("string");

      await tree.invite(bobUser.userId);
      await bob.joinRoom(tree.id);

      const bobRoom = await waitFor<object | null>(
        () => bob.getRoom(tree.id),
        { label: "Bob sees the room after invite" },
      );
      expect(bobRoom).not.toBeNull();
    } finally {
      stopTestClient(alice);
      stopTestClient(bob);
    }
  }, 30000);
});
