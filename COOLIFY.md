# Coolify deployment

This package deploys the React web app, FastAPI API, MongoDB, and WhatsApp service with Docker Compose.

## Deploy

1. Create a Compose-based application in Coolify from this repository or uploaded package.
2. Set the compose file to `docker-compose.yml`.
3. Add the variables from `.env.coolify.example`.
4. Set `REACT_APP_BACKEND_URL` to the public URL assigned to the backend service. This value is embedded into the frontend during its image build.
5. Set `JWT_SECRET` to a long random secret.
6. Expose the `frontend` service on port `3000`. The backend listens internally on `8001`; the WhatsApp service listens internally on `8002`.
7. Deploy and check `https://<frontend-domain>/`.

MongoDB data, backend uploads, and WhatsApp sessions are stored in named Docker volumes.

## Important

The frontend runs in the visitor's browser, so `REACT_APP_BACKEND_URL` must be a publicly reachable backend URL. Do not set it to `http://backend:8001`; that hostname is only available inside the Docker network.
