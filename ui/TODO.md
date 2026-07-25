# Storage UI — deferred work

Items intentionally left out of the file-manager refresh (2026-07-25).

## Role-aware UI

The backend enforces permissions (viewer cannot upload; editors can). The UI still
shows all actions to every member. Later: read the current user's role from
`listMembers`, hide upload/rename/delete/invite/remove for viewers, and gate
folder delete to owners.

## Async sync lag

Lists poll every 2.5–4s (`FolderContents`, `FileManager`, `MembersPanel`).
Later: subscribe to Matrix room/sync events so new files, members, and subfolders
appear without polling.

## Pre-deploy prod-bundle smoke

Run `vite build && vite preview` + minimal Playwright smoke in CI before GitHub
Pages upload — catches matrix-js-sdk dedupe / blank-page regressions before prod.
See `CLAUDE.md` known gap.
