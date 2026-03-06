---
name: deploy
description: Build and deploy to Cloudflare (production or dev), with migration check
disable-model-invocation: true
---

# Deploy

Build and deploy TallyReading to Cloudflare Workers.

## Steps

1. Check for pending migrations:
   ```bash
   npx wrangler d1 migrations list reading-manager-db --remote
   ```
   Compare against local `migrations/` directory. If there are unapplied migrations, warn the user and ask whether to apply them first.

2. Ask which environment (if not specified):
   - **Production**: `npm run go` (builds + deploys to tallyreading.uk)
   - **Dev**: `npm run build:deploy:dev` (builds + deploys to dev environment)

3. Run the build + deploy command.

4. After deploy, verify:
   ```bash
   curl -s https://tallyreading.uk/api/health | head -5
   ```
   (Use the dev URL for dev deploys)

5. If migrations were applied, remind the user to verify data integrity.
