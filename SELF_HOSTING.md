# Self-Hosting AZUX 3PL WMS on Hostinger VPS

This guide deploys the app on a Hostinger **VPS** (KVM 2 or higher,
Ubuntu 22.04) using Docker. Shared / Premium / Business hosting will
**not** work — the app needs a Node.js runtime.

Files added to the repo for self-hosting:

| File                  | Purpose                                         |
| --------------------- | ----------------------------------------------- |
| `Dockerfile`          | Builds the app for Node.js (multi-stage)        |
| `docker-compose.yml`  | Runs app + PostgreSQL 16 together               |
| `.dockerignore`       | Keeps the image small / safe                    |
| `.env.example`        | Template for runtime secrets                    |
| `vite.config.node.ts` | Node-target Vite config (replaces Lovable one)  |
| `db/init/`            | Drop `.sql` files here — auto-run on first boot |

---

## 1. Export the project from Lovable

1. In Lovable: **GitHub → Connect → Export repo** (or download as ZIP).
2. Clone the repo onto your laptop (you'll push it to the VPS later).

## 2. Swap to the Node-target Vite config (one-time)

The default `vite.config.ts` targets Cloudflare Workers (Lovable's
runtime). For self-hosting, swap in the Node-target config:

```bash
mv vite.config.ts        vite.config.lovable.ts   # keep as backup
mv vite.config.node.ts   vite.config.ts
rm -f wrangler.jsonc                              # not needed off Cloudflare
```

Add these scripts to `package.json` (under `"scripts"`):

```json
"start": "node .output/server/index.mjs",
"start:host": "HOST=0.0.0.0 PORT=3000 node .output/server/index.mjs"
```

And remove the Cloudflare-only dependency:

```bash
bun remove @cloudflare/vite-plugin
```

Verify the build works locally:

```bash
bun install
bun run build
bun run start
# Visit http://localhost:3000
```

> The Dockerfile does the rename + build automatically — these manual
> steps are only needed if you want to run **without** Docker.

## 3. Provision the Hostinger VPS

1. Hostinger panel → **VPS Hosting → KVM 2** (min 2 vCPU / 8 GB RAM).
2. OS: **Ubuntu 22.04 LTS**.
3. SSH in as root, then create a deploy user:
   ```bash
   ssh root@<VPS_IP>
   apt update && apt upgrade -y
   adduser azux && usermod -aG sudo,docker azux
   ```
4. Install Docker + Compose plugin + Nginx + Certbot:
   ```bash
   curl -fsSL https://get.docker.com | sh
   apt install -y nginx certbot python3-certbot-nginx git ufw
   ```
5. Firewall:
   ```bash
   ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable
   ```

## 4. Deploy the app

```bash
# As the azux user
sudo -iu azux
git clone <your-repo-url> /home/azux/wms
cd /home/azux/wms

# Configure secrets
cp .env.example .env
nano .env                                    # set strong POSTGRES_PASSWORD + SESSION_SECRET

# Build and start everything (app + db)
docker compose up -d --build
docker compose logs -f app                   # Ctrl+C to detach
```

The app is now listening on `127.0.0.1:3000` and Postgres on
`127.0.0.1:5432` (both bound to localhost only — not exposed to the
internet directly).

## 5. Point `wms.azuxit.com` at the VPS

In **Hostinger → Domains → azuxit.com → DNS records**:

| Type | Name | Value      | TTL |
| ---- | ---- | ---------- | --- |
| A    | wms  | `<VPS_IP>` | 300 |

Wait 1–5 minutes for propagation, then verify:

```bash
dig +short wms.azuxit.com    # should return your VPS IP
```

## 6. Nginx reverse proxy + free SSL

Create `/etc/nginx/sites-available/azux-wms`:

```nginx
server {
    server_name wms.azuxit.com;
    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_read_timeout 300s;
    }

    listen 80;
}
```

Enable + issue SSL (auto-renews):

```bash
sudo ln -s /etc/nginx/sites-available/azux-wms /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d wms.azuxit.com
```

Visit **https://wms.azuxit.com** — you should see the AZUX sign-in screen.

## 7. Updating the app

```bash
cd /home/azux/wms
git pull
docker compose up -d --build
```

Old containers are replaced; the Postgres volume (`azux_pgdata`)
persists between deploys.

## 8. Backups

Daily Postgres dump to `~/backups/`:

```bash
mkdir -p ~/backups
crontab -e
# Add:
0 2 * * * docker exec azux-db pg_dump -U azux_app azux_wms | gzip > /home/azux/backups/azux_wms_$(date +\%F).sql.gz
```

Also turn on **Hostinger VPS → Snapshots** in the panel for full
disk-level rollbacks.

## 9. Troubleshooting

| Symptom                             | Fix                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `502 Bad Gateway` from Nginx        | `docker compose ps` — app container down? `docker compose logs app`                |
| `connection refused` to Postgres    | DB not healthy yet — `docker compose ps`, wait for `(healthy)`                     |
| Cert issuance fails                 | DNS hasn't propagated — `dig wms.azuxit.com` first, then retry certbot             |
| App rebuilds but UI is stale        | Hard-refresh (Ctrl+Shift+R) — installable PWA caches the manifest icon             |
| Out-of-memory during `docker build` | Upgrade to KVM 4, or swap: `fallocate -l 2G /swap && mkswap /swap && swapon /swap` |

---

## What's still mock (next migration steps)

The app currently uses **in-memory mock data** in `src/lib/*-data.ts`
(clients, warehouses, items, inbound, inventory, orders, shipments,
BOL, billing). The Postgres container is up and ready, but the app
isn't reading from it yet.

Steps **2 and 3** from the original migration plan will:

- Add Drizzle ORM + a schema for all modules
- Replace mock data with `createServerFn` calls to Postgres
- Replace the mock sign-in (`password = "azux"`) with bcrypt + httpOnly
  session cookies

Ask Lovable for **"do steps 2 and 3"** when you're ready.
