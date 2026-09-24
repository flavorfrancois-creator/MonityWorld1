# Coolify deployment

This package deploys the React web app, FastAPI API, MongoDB, and WhatsApp service with Docker Compose.
Use `docker-compose.coolify.yml` as the deployment file in Coolify.

## Deploy

1. Create a Compose-based application in Coolify from this repository.
2. Set the compose file to `docker-compose.coolify.yml`.
3. Add the variables from `.env.coolify.example`.
4. Set `JWT_SECRET` to a long random secret.
5. Expose the `frontend` service on port `3000`. The backend listens internally on `8001`; the WhatsApp service listens internally on `8002`.
6. Deploy and check `https://<frontend-domain>/`.

MongoDB data, backend uploads, and WhatsApp sessions are stored in named Docker volumes.

Every service has a Docker health check. Coolify will mark a container unhealthy
when its local health endpoint or database probe fails, and the frontend waits
for the backend health check before starting. The checks are intentionally
startup-tolerant because WhatsApp/Chromium can take up to 45 seconds to start.

## Important

The browser calls the frontend's same-origin `/api` path. Nginx proxies that path to
`BACKEND_PROXY_URL`, so the bundled Compose deployment must use
`http://backend:8001`. Do not expose that internal URL to browser JavaScript.

For a separately deployed frontend resource, set the frontend build argument
`BACKEND_PROXY_URL` to the backend's public base URL. The current split Coolify
deployment uses `http://monityworld.win/admin`.
