# onsite-print-admin

System administration application for onsite-print, built with React and Vite.
It manages events, printer bookings, and printers through the same-origin
`/api/v2/` API.

The facilitator workspace is maintained independently in
[`onsite-print-event`](../onsite-print-event/README.md), served at `/event/`.
Attendee management, CSV import, and event check-in belong to that application.
This repository builds and serves only `/admin/`; it has no event-app imports
or special event-route handling.

## Start in the dev container

1. Install Docker and the VS Code Dev Containers extension.
2. Open this repository and select **Dev Containers: Reopen in Container**.
3. Run `npm run dev` and open <http://localhost:5173/admin/>.

The container uses Node.js 24 and installs dependencies automatically.
Its API proxy targets `http://host.docker.internal:8000`. Override
`API_PROXY_TARGET` to point to a different reachable backend or gateway.
The shared Copilot session-state mount requires `~/.copilot/session-state`
to exist on the host. Use only trusted code because session data is writable
from the container and can contain sensitive conversations.

## Run without a container

Use Node.js 24 (see `.nvmrc`), then run:

```sh
npm ci
npm run dev
```

The standalone proxy defaults to `http://127.0.0.1:8000`. Application requests
use relative `/api/v2/` URLs; no API contracts changed during the event split.

## Commands

```sh
npm test         # API collection and error-handling tests
npm run lint     # JavaScript and React checks
npm run build    # Production build in dist/
npm run preview  # Preview at /admin/
bash tests/docker-push-test.sh
```

## Deployment

The production image serves `/admin/`, redirects `/admin` to `/admin/`, and
serves assets under `/admin/assets/`. Other application prefixes return 404.
Start the full stack from the sibling `onsite-print-server` repository.
Deploy the standalone event image and updated gateway together when migrating
from the combined admin/event image.

To publish, choose the next `IMAGE_TAG` in `.env`, provide `CR_PAT` securely in
the environment with GHCR `write:packages` permission, and run:

```sh
bash docker-push.sh
```

The script publishes `ghcr.io/groskopf/onsite-print-admin:<IMAGE_TAG>` and
increments the patch version only after a successful push. `.env` contains
only the image tag, never credentials.

Alternatively, trigger the **Publish release** GitHub Actions workflow from the
Actions tab (`workflow_dispatch` only, runs from `main`). It reads the pending
`IMAGE_TAG` from `.env`, builds and pushes the image to GHCR using the built-in
`GITHUB_TOKEN`, tags the published commit on `main` with that version (no `v`
prefix), and commits the incremented `.env` back to `main`. This requires one-
time setup: personal-account repos can't add GitHub Actions to a ruleset's
bypass list, so add a `RELEASE_TOKEN` repository secret holding a fine-grained
personal access token (owned by a repository admin, scoped to this repo with
Contents: Read and write permission), and add the **Repository admin** role to
the branch ruleset's bypass list for `main`. Pushes authenticated with
`RELEASE_TOKEN` are attributed to the token owner's admin role and bypass the
pull-request requirement. Renew the token before it expires.

Application separation does not add authentication or authorization. Event
codes are not credentials; access controls must be enforced by the backend.
