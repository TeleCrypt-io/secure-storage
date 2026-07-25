import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import * as core from "./lib/core";
import * as auth from "./lib/auth";

// Wiring tests (jsdom): assert user actions call the right core.* function
// and render its result. core/ and auth are mocked at this boundary —
// crypto/E2EE correctness is proven separately by the Playwright E2E suite
// against a real Synapse, never here. See docs/UI_SPEC.md.
vi.mock("./lib/core", async () => {
  const actual = await vi.importActual<typeof import("./lib/core")>("./lib/core");
  return {
    ...actual,
    TeleCryptIOStorage: { create: vi.fn() },
    listFolders: vi.fn(),
    listPendingInvites: vi.fn(),
    createFolder: vi.fn(),
    joinFolder: vi.fn(),
    declineInvite: vi.fn(),
    listFiles: vi.fn(),
    listSubfolders: vi.fn(),
    createSubfolder: vi.fn(),
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
    renameFile: vi.fn(),
    renameFolder: vi.fn(),
    deleteFile: vi.fn(),
    deleteFolder: vi.fn(),
    shareFolder: vi.fn(),
    unshareFolder: vi.fn(),
    listMembers: vi.fn(),
    getFileDetails: vi.fn(),
    getFolderDetails: vi.fn(),
    setupRecovery: vi.fn(),
    restoreRecovery: vi.fn(),
  };
});

vi.mock("./lib/auth", () => ({
  loginWithPassword: vi.fn(),
  registerAccount: vi.fn(),
}));

const SESSION = {
  homeserver: "http://localhost:8008",
  userId: "@alice:localhost",
  deviceId: "DEVICE1",
  accessToken: "tok-123",
};

function fakeStorage() {
  return {
    getClient: () => ({ stopClient: vi.fn() }),
    keys: {
      isRecoverySetup: vi.fn().mockResolvedValue(false),
      setupRecovery: vi.fn(),
      restoreFromRecoveryKey: vi.fn(),
    },
  };
}

async function loginAndReachFolders(initialFolders: Array<{ id: string; name: string }> = []) {
  const storage = fakeStorage();
  vi.mocked(auth.loginWithPassword).mockResolvedValue(SESSION);
  vi.mocked(core.TeleCryptIOStorage.create).mockResolvedValue(storage as never);
  vi.mocked(core.listFolders).mockResolvedValue(initialFolders);
  vi.mocked(core.listPendingInvites).mockResolvedValue([]);

  const user = userEvent.setup();
  render(<App />);

  await user.clear(screen.getByTestId("homeserver"));
  await user.type(screen.getByTestId("homeserver"), SESSION.homeserver);
  await user.type(screen.getByTestId("username"), "alice");
  await user.type(screen.getByTestId("password"), "hunter2");
  await user.click(screen.getByTestId("submit"));

  await waitFor(() => expect(screen.getByTestId("current-user")).toHaveTextContent(SESSION.userId));
  if (initialFolders.length === 0) {
    await screen.findByTestId("no-folders");
  } else {
    await screen.findByText(initialFolders[0].name);
  }
  return { storage, user };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("login", () => {
  it("calls loginWithPassword with the entered credentials and lands on the folder list", async () => {
    await loginAndReachFolders();
    expect(auth.loginWithPassword).toHaveBeenCalledWith(
      SESSION.homeserver,
      "alice",
      "hunter2",
    );
    expect(core.TeleCryptIOStorage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: SESSION.homeserver,
        userId: SESSION.userId,
        deviceId: SESSION.deviceId,
        accessToken: SESSION.accessToken,
      }),
    );
    expect(screen.getByTestId("no-folders")).toBeInTheDocument();
  });

  it("shows the auth error from a failed login without calling storage.create", async () => {
    vi.mocked(auth.loginWithPassword).mockRejectedValue(new Error("login failed: 403"));
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByTestId("username"), "alice");
    await user.type(screen.getByTestId("password"), "wrong");
    await user.click(screen.getByTestId("submit"));

    expect(await screen.findByTestId("auth-error")).toHaveTextContent("login failed: 403");
    expect(core.TeleCryptIOStorage.create).not.toHaveBeenCalled();
  });
});

describe("folders", () => {
  it("creates a folder via core.createFolder with untitled name and inline rename", async () => {
    await loginAndReachFolders();
    vi.mocked(core.listFiles).mockResolvedValue([]);
    vi.mocked(core.listSubfolders).mockResolvedValue([]);
    vi.mocked(core.listMembers).mockResolvedValue([]);
    vi.mocked(core.getFolderDetails).mockResolvedValue({
      name: "Untitled folder",
      id: "!new:localhost",
      createdAt: null,
      memberCount: 1,
    });
    vi.mocked(core.createFolder).mockResolvedValue({ id: "!new:localhost", name: "Untitled folder" });
    vi.mocked(core.renameFolder).mockResolvedValue({ id: "!new:localhost", name: "Docs" });
    vi.mocked(core.listFolders).mockResolvedValue([{ id: "!new:localhost", name: "Docs" }]);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("create-folder"));

    expect(core.createFolder).toHaveBeenCalledWith(expect.anything(), "Untitled folder");

    const renameInput = await screen.findByTestId("rename-folder-input");
    fireEvent.change(renameInput, { target: { value: "Docs" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });
    await waitFor(() =>
      expect(core.renameFolder).toHaveBeenCalledWith(expect.anything(), "!new:localhost", "Docs"),
    );
    expect(await screen.findByTestId("folder-detail")).toHaveAttribute("data-folder-id", "!new:localhost");
  });

  it("accepts a pending invite via core.joinFolder", async () => {
    const storage = fakeStorage();
    vi.mocked(auth.loginWithPassword).mockResolvedValue(SESSION);
    vi.mocked(core.TeleCryptIOStorage.create).mockResolvedValue(storage as never);
    vi.mocked(core.listFolders).mockResolvedValue([]);
    vi.mocked(core.listPendingInvites).mockResolvedValue([
      { id: "!shared:localhost", name: "Shared" },
    ]);

    const user = userEvent.setup();
    render(<App />);

    await user.clear(screen.getByTestId("homeserver"));
    await user.type(screen.getByTestId("homeserver"), SESSION.homeserver);
    await user.type(screen.getByTestId("username"), "alice");
    await user.type(screen.getByTestId("password"), "hunter2");
    await user.click(screen.getByTestId("submit"));

    await waitFor(() => expect(screen.getByTestId("current-user")).toHaveTextContent(SESSION.userId));
    await screen.findByTestId("invite-list");
    await user.click(screen.getByTestId("accept-invite"));

    await waitFor(() =>
      expect(core.joinFolder).toHaveBeenCalledWith(expect.anything(), "!shared:localhost"),
    );
  });

  it("opens a folder and lists its files via core.listFiles", async () => {
    vi.mocked(core.listFiles).mockResolvedValue([{ id: "$file1", name: "report.pdf" }]);
    vi.mocked(core.listSubfolders).mockResolvedValue([]);
    vi.mocked(core.listMembers).mockResolvedValue([]);
    vi.mocked(core.getFolderDetails).mockResolvedValue({
      name: "Docs",
      id: "!f:localhost",
      createdAt: null,
      memberCount: 1,
    });
    await loginAndReachFolders([{ id: "!f:localhost", name: "Docs" }]);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Docs" }));

    expect(core.listFiles).toHaveBeenCalledWith(expect.anything(), "!f:localhost");
    expect(await screen.findByText("report.pdf")).toBeInTheDocument();
  });
});

describe("file upload/download", () => {
  async function openFolder(initialFiles: Array<{ id: string; name: string }> = []) {
    vi.mocked(core.listFiles).mockResolvedValue(initialFiles);
    vi.mocked(core.listSubfolders).mockResolvedValue([]);
    vi.mocked(core.listMembers).mockResolvedValue([]);
    vi.mocked(core.getFolderDetails).mockResolvedValue({
      name: "Docs",
      id: "!f:localhost",
      createdAt: null,
      memberCount: 1,
    });
    await loginAndReachFolders([{ id: "!f:localhost", name: "Docs" }]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Docs" }));
    if (initialFiles.length === 0) {
      await screen.findByTestId("no-files");
    } else {
      await screen.findByText(initialFiles[0].name);
    }
    return user;
  }

  it("uploads a picked file via core.uploadFile", async () => {
    const user = await openFolder();
    vi.mocked(core.uploadFile).mockResolvedValue({ id: "$new", name: "hello.txt" });
    vi.mocked(core.listFiles).mockResolvedValue([{ id: "$new", name: "hello.txt" }]);

    const file = new File(["hello world"], "hello.txt", { type: "text/plain" });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() =>
      expect(core.uploadFile).toHaveBeenCalledWith(
        expect.anything(),
        "!f:localhost",
        "hello.txt",
        expect.any(Uint8Array),
        "text/plain",
      ),
    );
    expect(await screen.findByText("hello.txt")).toBeInTheDocument();
  });

  it("downloads a file via core.downloadFile when Download is clicked", async () => {
    vi.mocked(core.downloadFile).mockResolvedValue({
      bytes: new TextEncoder().encode("hello world"),
      mimetype: "text/plain",
      name: "hello.txt",
    });
    const user = await openFolder([{ id: "$f1", name: "hello.txt" }]);

    await user.click(screen.getByTestId("download-file"));

    await waitFor(() =>
      expect(core.downloadFile).toHaveBeenCalledWith(expect.anything(), "!f:localhost", "$f1"),
    );
  });
});

describe("sharing", () => {
  it("invites a user via core.shareFolder and shows them in the member list", async () => {
    vi.mocked(core.listFiles).mockResolvedValue([]);
    vi.mocked(core.listSubfolders).mockResolvedValue([]);
    vi.mocked(core.listMembers).mockResolvedValue([]);
    vi.mocked(core.getFolderDetails).mockResolvedValue({
      name: "Docs",
      id: "!f:localhost",
      createdAt: null,
      memberCount: 1,
    });
    await loginAndReachFolders([{ id: "!f:localhost", name: "Docs" }]);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Docs" }));
    await screen.findByTestId("no-files");

    vi.mocked(core.shareFolder).mockResolvedValue({
      folderId: "!f:localhost",
      userId: "@bob:localhost",
      role: "editor",
    });
    vi.mocked(core.listMembers).mockResolvedValue([
      { userId: "@bob:localhost", role: "editor", membership: "invite" },
    ]);

    await user.type(screen.getByTestId("share-user-id"), "@bob:localhost");
    await user.click(screen.getByTestId("share-submit"));

    expect(core.shareFolder).toHaveBeenCalledWith(
      expect.anything(),
      "!f:localhost",
      "@bob:localhost",
      "editor",
    );
    expect(await screen.findByTestId("member-item")).toHaveAttribute("data-user-id", "@bob:localhost");
  });

  it("removes a member via core.unshareFolder", async () => {
    vi.mocked(core.listFiles).mockResolvedValue([]);
    vi.mocked(core.listSubfolders).mockResolvedValue([]);
    vi.mocked(core.listMembers).mockResolvedValue([
      { userId: "@bob:localhost", role: "viewer", membership: "join" },
    ]);
    vi.mocked(core.getFolderDetails).mockResolvedValue({
      name: "Docs",
      id: "!f:localhost",
      createdAt: null,
      memberCount: 2,
    });
    await loginAndReachFolders([{ id: "!f:localhost", name: "Docs" }]);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Docs" }));
    await screen.findByTestId("member-item");

    vi.mocked(core.unshareFolder).mockResolvedValue({
      folderId: "!f:localhost",
      userId: "@bob:localhost",
      removed: true,
    });
    vi.mocked(core.listMembers).mockResolvedValue([]);

    await user.click(screen.getByTestId("unshare-member"));

    expect(core.unshareFolder).toHaveBeenCalledWith(
      expect.anything(),
      "!f:localhost",
      "@bob:localhost",
    );
  });
});

describe("recovery", () => {
  it("sets up recovery via core.setupRecovery and shows the recovery key", async () => {
    const { storage } = await loginAndReachFolders();
    vi.mocked(storage.keys.isRecoverySetup).mockResolvedValue(false);
    vi.mocked(core.setupRecovery).mockResolvedValue({ recoveryKey: "EsTx 1234 5678" });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("nav-recovery"));
    await user.click(await screen.findByTestId("setup-recovery"));

    expect(core.setupRecovery).toHaveBeenCalledWith(expect.anything());
    expect(await screen.findByTestId("recovery-key-value")).toHaveTextContent("EsTx 1234 5678");
  });

  it("restores from a pasted key via core.restoreRecovery", async () => {
    await loginAndReachFolders();
    vi.mocked(core.restoreRecovery).mockResolvedValue({ imported: 3, total: 3 });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("nav-recovery"));
    await user.type(screen.getByTestId("restore-key-input"), "EsTx recovery key text");
    await user.click(screen.getByTestId("restore-submit"));

    expect(core.restoreRecovery).toHaveBeenCalledWith(expect.anything(), "EsTx recovery key text");
    expect(await screen.findByTestId("restore-result")).toHaveTextContent("Imported 3 of 3");
  });
});
