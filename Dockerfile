# Worker image for the ingestion sweep and the 5-minute match → notify pulse.
# The web tier deploys to Vercel; this image only runs scripts/worker/*.
FROM node:20-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Workspace manifests are needed by `npm ci`; dependencies get their own layer.
COPY package.json package-lock.json ./
COPY apps ./apps
# Root production dependencies only: the Expo app and build tooling are not
# needed by the workers. `--ignore-scripts` skips the patch-package postinstall
# (the repo has no patches).
RUN npm ci --omit=dev --workspaces=false --ignore-scripts

ENV NODE_ENV=production

COPY . .

# Override the command with `node scripts/worker/ingest.js` for the ingest
# service. Both processes expect a single replica.
CMD ["node", "scripts/worker/pulse.js"]
