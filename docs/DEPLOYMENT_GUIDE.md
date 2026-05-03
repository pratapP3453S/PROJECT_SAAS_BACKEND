# Comprehensive Master Deployment Guide

This guide details the exhaustive, step-by-step procedures for deploying the project. It covers full server preparation, pipeline mechanics, and execution paths for both **Single VPS** and **Multi-VPS** environments.

For information on Environment Variables, structure, and values, strictly refer to `ENV_CONFIGURATION.md`.

---

## 1. Pre-Deployment: Server Preparation

Before deploying, ensure your host servers possess the correct OS dependencies. 

### Step 1.1: Connect and Update System
```bash
ssh user@your-vps-ip

# Update OS registry and packages
sudo apt update && sudo apt upgrade -y
```

### Step 1.2: Check Resources
To run the enterprise node stack alongside PostgreSQL and Redis effectively, confirm your VPS parameters:
```bash
nproc       # CPU cores (Recommended minimum: 2)
free -h     # RAM available (Recommended minimum: 4GB)
df -h       # Disk space
```

### Step 1.3: Install Docker (If absent)
```bash
# Automated install script natively from Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add current user to docker group to bypass `sudo` requirements
sudo usermod -aG docker $USER
newgrp docker

# Verify installation metrics
docker --version
docker compose version
```

---

## 2. Choosing Your Deployment Architecture

> **Architecture A (Single VPS)**: Run Staging and Prod on the same physical machine. High cost efficiency, optimal for lower traffic environments (~50% cost savings). Requires diligent port mapping to avoid overlap.
> **Architecture B (Multi-VPS)**: Separate physical machines resolving separately. Highly recommended for enterprise resilience to prevent a Staging memory leak from destroying hardware availability for Live Production.

Regardless of your architecture, define the secure directory footprints on your target servers:
```bash
sudo mkdir -p /apps/staging
sudo mkdir -p /apps/production
sudo chown -R $USER:$USER /apps
```

---

## 3. The Delivery Pipeline (Code to Server)

You can deliver your code to your servers utilizing one of two methods based on your organizational constraints:

### Method A: Local OS Build via Git (Developer Friendly)
*Compiles the application directly on the server host. Easiest workflow for standalone developers.*

```bash
cd /apps/production

# First-time load:
git clone https://github.com/your-org/your-repo.git .

# Updating load:
git pull origin main

# Build Image and Application locally on the server
pnpm install
pnpm run docker:prod:build
```

### Method B: Immutable Docker Registry (Enterprise Grade)
*Compiles locally or in CI/CD, preventing the live VPS from experiencing severe CPU load exhaustion during builds/compilations alongside active traffic.*

**1. On your local machine (or GitHub Actions script):**
```bash
docker login --username your_dockerhub_id

# Build Tagged Images defining exact multi-stage targets
docker build --target production -t your_dockerhub_id/nestjs_app:production-latest .
docker build --target development -t your_dockerhub_id/nestjs_app:staging-v1 .

# Push to Registry Network
docker push your_dockerhub_id/nestjs_app:production-latest
```

**2. On the VPS (inside `/apps/production`):**
```bash
docker pull your_dockerhub_id/nestjs_app:production-latest

# Deploy safely bypassing standard compose build limits
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## 4. Execution: Architecture A (Single VPS) Setup

If maintaining both environments on a single rig, separation of variables is paramount.

### 4.1 Staging Environment Execution
```bash
cd /apps/staging

# Provide the .env variables
nano .env.stg
```
*Ensure `.env.stg` holds the mapped testing constraints:*
```env
NODE_ENV=staging
PORT=5005
POSTGRES_PORT=5435
REDIS_PORT=6385
POSTGRES_PASSWORD=your-stg-secure-password-change-me!
JWT_SECRET=your-unique-staging-jwt-secret-32chars!
```

```bash
# Build and Start Staging
pnpm run docker:stg:build

# Verify container boot integrity
docker ps | grep stg
curl http://localhost:5005/health
```

### 4.2 Production Environment Execution
```bash
cd /apps/production

nano .env.prod
```
*Ensure `.env.prod` commands the primary live ports without touching staging:*
```env
# CRITICAL: Change these for YOUR production environment
NODE_ENV=production
PORT=5010
POSTGRES_PORT=5430
REDIS_PORT=6370
POSTGRES_PASSWORD=your-prod-extremely-secure-password!
JWT_SECRET=your-unique-prod-jwt-secret-32chars!
```

```bash
# Build and Start Production
pnpm run docker:prod:build

curl http://localhost:5010/health
```

---

## 5. Execution: Architecture B (Multi-VPS) Setup

If applying architecture B, simply navigate to `/apps/staging` on **VPS A**, and `/apps/production` on **VPS B**, relying on the respective `pnpm run docker:stg:build` vs `pnpm run docker:prod:build` scripts as dictated above.

### 5.1 Systemd Auto-Restart on Reboot (Critical)

Docker native restart flags can occasionally fail during physical kernel crashes. To ensure your application automatically survives a server hard-reboot, bind Docker Compose directly to systemd.

**For Staging:**
```bash
sudo tee /etc/systemd/system/nestjs-staging.service > /dev/null <<EOF
[Unit]
Description=NestJS Staging Environment
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/apps/staging
ExecStart=/usr/bin/docker-compose -f docker-compose.yml -f docker-compose.stg.yml up -d
ExecStop=/usr/bin/docker-compose -f docker-compose.yml -f docker-compose.stg.yml down

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable nestjs-staging.service
sudo systemctl start nestjs-staging.service
```

**For Production:**
```bash
sudo tee /etc/systemd/system/nestjs-production.service > /dev/null <<EOF
[Unit]
Description=NestJS Production Environment
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/apps/production
ExecStart=/usr/bin/docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker-compose -f docker-compose.yml -f docker-compose.prod.yml down

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable nestjs-production.service
sudo systemctl start nestjs-production.service
```

---

## 6. PM2 Ecosystem Deployment (Bare-metal Application Governance)

If you are **not** containerizing the Node application (for example, if Postgres/Redis exist natively on the Host OS per corporate instruction), completely bypass Docker deployments. Route governance via the PM2 cluster system.

1. **Install and Build:**
   ```bash
   pnpm install
   pnpm run build
   ```
2. **Setup Global PM2 Ecosystem Configuration (`/apps/production/ecosystem.config.js`):**
   ```javascript
   module.exports = {
     apps: [
       {
         name: "api-prod",
         script: "dist/main.js",
         instances: "max",       // Leverages Node cluster module across all CPU cores effectively utilizing 100% of underlying server processing power
         exec_mode: "cluster",
         env: { NODE_ENV: "production", PORT: 5010 }
       },
       {
         name: "api-stg",
         script: "dist/main.js",
         instances: 1,           // Single thread instance for staging footprint minimums
         env: { NODE_ENV: "staging", PORT: 5005 }
       }
     ]
   }
   ```
3. **Launch Deployment Sequence:**
   ```bash
   pm2 start ecosystem.config.js --only api-prod
   pm2 start ecosystem.config.js --only api-stg
   
   # Write configurations to memory block surviving OS resets
   pm2 save
   pm2 startup
   ```

---

## 7. Nginx Proxy Configuration

In enterprise Linux environments (RHEL, CentOS, Rocky, Amazon Linux), Nginx configurations reside securely in `/etc/nginx/conf.d/` rather than leveraging Debian's `sites-available` / `sites-enabled` symlink format.

### Step 7.1: Set up the Server Blocks (Standard HTTP Layout)

To protect from `certbot` misconfigurations, we first deploy an standard HTTP block ensuring Nginx serves generic traffic dynamically before parsing it to Certbot. Do **not** use `certbot certonly`.

```bash
sudo vim /etc/nginx/conf.d/api.yourapp.com.conf
```

**Configuration entry (`api.yourapp.com.conf`):**
```nginx
server {
    listen 80;
    server_name api.yourapp.com; # Modify mapped to live domain 

    location / {
        proxy_pass http://localhost:5010; # Prod Port Execution Check
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # IP Forwarding Transparency Check
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

*(Repeat identical creation process utilizing `/etc/nginx/conf.d/staging.yourapp.com.conf` pointing to internal `http://localhost:5005` if routing locally side-by-side).*

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Step 7.2: Automate SSL Formatting using Certbot

Once your domain `A Records` correctly resolve to the VPS IP, finalize execution via certbot:
```bash
sudo certbot --nginx -d api.yourapp.com
```
*Note: Certbot effortlessly reads `api.yourapp.com.conf`, safely captures the exposed blocks, reroutes Port 80 through a permanent 301 HTTPS forward, and auto-appends Let's Encrypts globally standard `listen 443 ssl` blocks seamlessly inside the file structure enabling robust traffic security natively.*

---

## 8. Database Management & Routine Monitoring

### 8.1 Accessing the Databases Securely

**From the connected VPS:**
```bash
docker exec -it postgres_prod psql -U prod_user -d nestjs_prod
```

**From Local Machine Desktop (via Secure SSH Tunneling only):**
```bash
ssh -L 5430:localhost:5430 user@your-vps-ip
psql -h localhost -p 5430 -U prod_user -d nestjs_prod
```

### 8.2 Database Backups & Automated Crontabs

**Execute Manual Backup:**
```bash
docker exec postgres_prod pg_dump -U prod_user nestjs_prod > /apps/backups/prod-backup-$(date +%Y%m%d).sql
```

**Set up Automated Daily Backups via Linux Cron Daemon:**
```bash
crontab -e
```
Add the proceeding operation to trigger safely at 2:00 AM server-time daily:
```bash
0 2 * * * docker exec postgres_prod pg_dump -U prod_user -d nestjs_prod > /apps/backups/prod_$(date +\%Y\%m\%d).sql
```
*(Optional Step for Cloud Persistence: Chain execution directly into an AWS S3 bucket using Unix pipes `... | aws s3 cp - s3://your-backup-bucket/...`)*

### 8.3 Server Health Monitoring

Do not guess server loads. Monitor utilized footprints algorithmically alongside live-tails preventing application starvation. 
```bash
# Verify active allocation quotas on Memory and CPU cycles
watch -n 1 'docker stats --no-stream'

# Monitor realtime active events / bugs
docker logs app_prod -f --tail 50
docker logs app_stg -f --tail 50
```

### 8.4 Complete Annihilation Reset (WARNING)

If an environment becomes hopelessly corrupt requiring destroying all schema configurations and cached Redis keys permanently:
```bash
cd /apps/production
pnpm run docker:down:v
# Pause.. allow OS cleanup sequences to pass ...

pnpm run docker:prod:build
```
