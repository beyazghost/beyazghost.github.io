# Journo Status Service

This is a lightweight Cloudflare Worker that powers the public check-in status on the journalistic safety page.

## Features

- `GET /status` returns the most recent known safety status
- `POST /checkin` records a new status update using a shared token
- `POST /request` accepts and stores welfare requests
- Uses an HMAC signature when `STATUS_SECRET` is configured
- Falls back to an in-memory status object when no KV namespace is attached

## Local safety check-in

To prompt for a safe word every 17 hours and push the result to the Worker:

```bash
export JOURNO_STATUS_API="https://your-worker.example.workers.dev"
export JOURNO_STATUS_TOKEN="replace-with-the-worker-token"
node checkin.js
```

To prompt once right now without waiting for the timer:

```bash
node checkin.js --once
```

The script stores only the timestamp of the last successful check-in in `~/.journo-checkin-state.json`. It does not store the safe word in plain text.

## Deployment

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Cloudflare KV namespace if you want persistence beyond worker memory:

   ```bash
   npx wrangler kv:namespace create "STATUS_KV"
   ```

3. Add the namespace binding to `wrangler.toml`.

4. Configure sensitive values as encrypted Worker secrets. Run these commands
   from this directory and enter each value at Wrangler's prompt:

   ```bash
   npx wrangler secret put STATUS_TOKEN
   npx wrangler secret put STATUS_SECRET
   npx wrangler secret put DASHBOARD_PASSWORD
   npx wrangler secret put DASHBOARD_SESSION_SECRET
   npx wrangler secret put CLOUDFLARE_API_TOKEN
   ```

   Do not put these values in `wrangler.toml` or commit them to Git.

5. Deploy:

   ```bash
   npm run deploy
   ```

## Example check-in

```bash
curl -X POST https://your-worker.example.workers.dev/checkin \
  -H "Authorization: Bearer replace-with-a-long-random-token" \
  -H "Content-Type: application/json" \
  -d '{"status":"ok","window_hours":24,"note":"Checked in from the field"}'
```

## Example status fetch

```bash
curl https://your-worker.example.workers.dev/status
```

## Notes

This is intentionally designed to be trustable and readable: public status remains public, while the request intake continues to be handled separately.
