# Beta System Linux Deployment (GCP VM)

This guide assumes Ubuntu 22.04/24.04 and one domain: `platform.betaserver.dev`.
It removes the old `xplusapi.betaserver.dev`/port `5500` proxy path.

## 1) Create VM and open firewall

1. Create an Ubuntu VM in GCP.
2. Reserve a static external IP and attach it.
3. Open ports `22`, `80`, `443` in the VM firewall/network tags.
4. Point DNS A record:
   - `platform.betaserver.dev` -> VM static IP

## 2) Install system packages

```bash
sudo apt update
sudo apt install -y git curl build-essential nginx redis-server default-mysql-client \
  python3 python3-venv python3-pip certbot python3-certbot-nginx poppler-utils \
  ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
  libcups2 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libu2f-udev libvulkan1 \
  libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
  libxkbcommon0 libxrandr2 xdg-utils
```

Install Node 20 LTS:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 3) Clone code

```bash
sudo mkdir -p /opt/beta-system
sudo chown -R $USER:$USER /opt/beta-system
cd /opt/beta-system
git clone <YOUR_GITHUB_REPO_URL> .
```

## 4) Backend + frontend install/build

```bash
cd /opt/beta-system/backend
npm ci

cd /opt/beta-system/backend/python_scripts
python3 -m venv ../.venv
source ../.venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

cd /opt/beta-system/frontend
npm ci
npm run build
```

## 5) Configure `.env`

1. Copy template:

```bash
cp /opt/beta-system/backend/.env.example.linux /opt/beta-system/backend/.env
```

2. Fill real values in `/opt/beta-system/backend/.env`.
3. Keep certificate/key files for Inter API inside:
   - `/opt/beta-system/backend/services/Inter_API_Certificado.crt`
   - `/opt/beta-system/backend/services/Inter_API_Chave.key`
4. Set these env values to those relative paths:
   - `INTER_CERT_FILE=services/Inter_API_Certificado.crt`
   - `INTER_KEY_FILE=services/Inter_API_Chave.key`

## 6) Restore MySQL backup

```bash
# Example:
mysql -h <DB_HOST> -u <DB_USER> -p -e "CREATE DATABASE IF NOT EXISTS beta_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -h <DB_HOST> -u <DB_USER> -p beta_system < /path/to/your_backup.sql
```

If needed, run missing migrations from `/opt/beta-system/db/migrations`.

## 7) Create systemd services

Main API server `/etc/systemd/system/beta-server.service`:

```ini
[Unit]
Description=Beta System API Server
After=network.target redis-server.service

[Service]
WorkingDirectory=/opt/beta-system/backend
Environment=PATH=/opt/beta-system/backend/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=production
EnvironmentFile=/opt/beta-system/backend/.env
ExecStart=/usr/bin/node /opt/beta-system/backend/server.js
Type=simple
User=www-data
Group=www-data
Restart=always
RestartSec=5
StandardOutput=append:/var/log/beta-server.log
StandardError=append:/var/log/beta-server.error.log

[Install]
WantedBy=multi-user.target
```

Create these additional units:

- `/etc/systemd/system/beta-xpayz-sync.service` with:
  - `ExecStart=/usr/bin/node /opt/beta-system/backend/xpayzSyncService.js`
- `/etc/systemd/system/beta-trkbit-sync.service` with:
  - `ExecStart=/usr/bin/node /opt/beta-system/backend/trkbitSyncService.js`
- `/etc/systemd/system/beta-usdt-sync.service` with:
  - `ExecStart=/usr/bin/node /opt/beta-system/backend/usdtSyncService.js`
- `/etc/systemd/system/beta-alfa-sync.service` with:
  - `ExecStart=/usr/bin/node /opt/beta-system/backend/alfaSyncService.js`
- `/etc/systemd/system/beta-bridge-linker.service` with:
  - `ExecStart=/usr/bin/node /opt/beta-system/backend/services/bridgeLinkerService.js`

For each of those units, use the same `[Unit]`, `WorkingDirectory`, `Environment`, `EnvironmentFile`, `User`, `Group`, `Restart`, and logging lines from `beta-server.service`. Only change `Description` and `ExecStart`.

Example worker unit (`/etc/systemd/system/beta-xpayz-sync.service`):

```ini
[Unit]
Description=Beta XPayz Sync
After=network.target

[Service]
WorkingDirectory=/opt/beta-system/backend
Environment=PATH=/opt/beta-system/backend/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=production
EnvironmentFile=/opt/beta-system/backend/.env
ExecStart=/usr/bin/node /opt/beta-system/backend/xpayzSyncService.js
Type=simple
User=www-data
Group=www-data
Restart=always
RestartSec=5
StandardOutput=append:/var/log/beta-xpayz-sync.log
StandardError=append:/var/log/beta-xpayz-sync.error.log

[Install]
WantedBy=multi-user.target
```

Optional Telegram listener unit `/etc/systemd/system/beta-telegram-listener.service`:

```ini
[Unit]
Description=Beta Telegram Listener
After=network.target

[Service]
WorkingDirectory=/opt/beta-system/backend
Environment=PATH=/opt/beta-system/backend/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=production
EnvironmentFile=/opt/beta-system/backend/.env
ExecStart=/opt/beta-system/backend/.venv/bin/python /opt/beta-system/backend/python_scripts/telegram_listener.py
Type=simple
User=www-data
Group=www-data
Restart=always
RestartSec=5
StandardOutput=append:/var/log/beta-telegram-listener.log
StandardError=append:/var/log/beta-telegram-listener.error.log

[Install]
WantedBy=multi-user.target
```

Reload and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now redis-server
sudo systemctl enable --now beta-server beta-xpayz-sync beta-trkbit-sync beta-usdt-sync beta-alfa-sync beta-bridge-linker
# optional:
sudo systemctl enable --now beta-telegram-listener
```

Check status:

```bash
sudo systemctl status beta-server --no-pager
sudo journalctl -u beta-server -f
```

## 8) Nginx config (single domain, no 5500 proxy)

Create `/etc/nginx/sites-available/beta-platform`:

```nginx
server {
    listen 80;
    server_name platform.betaserver.dev;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name platform.betaserver.dev;

    ssl_certificate /etc/letsencrypt/live/platform.betaserver.dev/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/platform.betaserver.dev/privkey.pem;

    location ~ ^/(api|portal)/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        root /opt/beta-system/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

Enable site:

```bash
sudo mkdir -p /var/www/certbot
sudo ln -sf /etc/nginx/sites-available/beta-platform /etc/nginx/sites-enabled/beta-platform
sudo nginx -t
sudo systemctl reload nginx
```

Issue TLS cert:

```bash
sudo certbot --nginx -d platform.betaserver.dev
```

## 9) Verify end-to-end

```bash
curl -I https://platform.betaserver.dev
curl -I https://platform.betaserver.dev/api/auth/login
```

App checks:

1. Admin login works.
2. Portal login works.
3. Socket updates work (broadcast/pin progress).
4. File uploads + previews work.
5. Schedulers insert/update data.
6. Redis queue active, no worker errors.

## 10) Update deployments

```bash
cd /opt/beta-system
git pull
cd backend && npm ci
cd ../frontend && npm ci && npm run build
sudo systemctl restart beta-server beta-xpayz-sync beta-trkbit-sync beta-usdt-sync beta-alfa-sync beta-bridge-linker
```
