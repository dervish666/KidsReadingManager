# Refactor Persistence Plan

**Goal:** Refactor the application to use a single Docker container with a host-mounted volume (`./config`) for data persistence, eliminating the separate API server.

**Approved Plan:**

1.  **Modify `Dockerfile`**:
    *   Replace the `nginx:stable-alpine` final stage with a `node:18-alpine` (or similar) stage.
    *   Copy the built React app (`/app/build`) from the build stage to a location the Node server can serve (e.g., `/app/public`).
    *   Copy the server script (e.g., `server/index.js`) and `package.json` for server dependencies.
    *   Install server dependencies (`npm install --production`).
    *   Set the `CMD` to run the Node.js server script (e.g., `node server/index.js`).
    *   Expose the port the Node server will listen on (e.g., 3000).

2.  **Adapt `server/index.js`**:
    *   Add middleware to serve static files from the React build directory (e.g., `/app/public`).
    *   Modify the `DATA_FILE` path to point to `/config/app_data.json`. Ensure the `/config` directory is checked/created if it doesn't exist within the script's logic.
    *   Keep all existing API endpoint logic (`/api/students`, `/api/settings`, `/api/data`, etc.).
    *   Ensure the server listens on the port exposed in the `Dockerfile` (e.g., 3000).

3.  **Update `docker-compose.yml`**:
    *   Remove the entire `api-server` service definition.
    *   Remove the `networks` section if only one service remains.
    *   Remove the `volumes` definition for `reading-data`.
    *   In the `kids-reading-manager` service:
        *   Update `build` context/dockerfile if necessary.
        *   Update `image` name if desired.
        *   Change `ports` mapping to reflect the Node.js server port (e.g., `"8080:3000"`).
        *   Remove `depends_on: - api-server`.
        *   Remove the `volumes` entry for `nginx.conf`.
        *   Add the host volume mount: `volumes: - ./config:/config`.

4.  **Update Documentation & Version**:
    *   Update `app_overview.md` to describe the new single-container architecture and data persistence method.
    *   Add an entry to `cline_docs/progress.md` (changelog).
    *   Increment the version number in `package.json`.

**Proposed Architecture Diagram:**

```mermaid
graph TD
    subgraph Host Machine
        direction LR
        HostDir[./config Directory]
    end

    subgraph Docker Container (kids-reading-manager)
        direction LR
        NodeServer[Node.js Server (Express)] --> ReactApp[Serves React Build]
        NodeServer --> DataAPI[/api/* Endpoints]
        DataAPI --> ReadWrite[Reads/Writes /config/app_data.json]
    end

    User[User Browser] --> ContainerPort[Host Port (e.g., 8080)]
    ContainerPort --> NodeServer
    HostDir <-.-> ReadWrite  # Volume Mount

    style HostDir fill:#f9f,stroke:#333,stroke-width:2px
    style ReadWrite fill:#ccf,stroke:#333,stroke-width:2px