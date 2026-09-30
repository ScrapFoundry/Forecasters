# Deploying FORECASTERS on a VPS

One Ubuntu VPS runs both processes:

| Process | What it does | Reads |
| --- | --- | --- |
| `forecasters-web` | the site (`next start`, port 3000) behind Caddy (HTTPS) | `.env` |
| `forecasters-worker` | the pipeline: questions, paid IMD jobs, resolutions | `.env` + `.env.worker` (keys) |

No paid cron: the worker wakes itself only when there is work.

---

## 0. Before you start

* A domain (or subdomain) you can point at the VPS.
* A Supabase project (free tier is fine).
* An OpenAI API key.
* A **new** wallet only for paying IMD. Send it about 20 IMD and a little ETH (one approval tx). Never your creator or treasury wallet.
* If the VPS already runs something on port 3000 (for example another project), change `-p 3000` in `ecosystem.config.cjs` and the port in the Caddyfile.

## 1. Server packages (once)

```bash
sudo apt update && sudo apt install -y git unzip curl debian-keyring debian-archive-keyring apt-transport-https
# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
# pm2
sudo npm i -g pm2
# Caddy (automatic HTTPS)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
# firewall
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

## 2. Database

Supabase → SQL editor → paste and run `supabase/schema.sql`. Copy the project URL and the **service role** key (Settings → API).

## 3. Code and configuration

```bash
sudo mkdir -p /opt/forecasters && sudo chown $USER /opt/forecasters
# upload forecasters.zip from your PC:  scp forecasters.zip user@VPS:/opt/
cd /opt && unzip -o forecasters.zip && cd /opt/forecasters
npm ci
cp .env.example .env
cp .env.worker.example .env.worker && chmod 600 .env.worker
nano .env          # SUPABASE_*, OPERATOR_ADDRESS (your public address), OPERATOR_SESSION_SECRET, NEXT_PUBLIC_DEMO_MODE=false
nano .env.worker   # OPERATOR_PRIVATE_KEY (payer), IMD_BEARER_TOKEN, ETH_RPC_URL, OPENAI_API_KEY
npm run build      # NEXT_PUBLIC_* values are baked in here: rebuild after changing them
```

Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (one for `OPERATOR_SESSION_SECRET`, one for `IMD_BEARER_TOKEN`; keep the bearer token forever).

## 4. First contact with IMD (free, then one approval)

```bash
npm run imd -- probe     # free: quotes our bodies and reads one payment challenge. Must end with "readyToPay": true
npm run imd -- wallet    # payer address, IMD and ETH balance, Permit2 allowance
npm run imd -- approve   # once: approve IMD to Permit2 (costs a little ETH)
```

If the probe is not ready, stop here and read its `challenge.checks` / error output.

## 5. Start, test, launch

1. In `.env.worker` set `IMD_PAYMENTS_ENABLED=true`. Leave `TOKEN_ADDRESS` empty in `.env` for now: while it is empty the site shows **CA: NOT LIVE YET** and the question agent does not run (pre-launch).
2. Start everything: `pm2 start ecosystem.config.cjs && pm2 save && pm2 startup` (run the command pm2 prints).
3. Open `https://your-domain/operator`, connect your wallet, sign in.
4. Optional test before launch: **CREATE QUESTION** by hand (manual questions run even in pre-launch). Check on its page that the 3 chain steps landed on different seats; if a seat repeats, set `FORECAST_JOB_SHAPE=single`.
5. **Launch**: paste the CA into `.env` (`TOKEN_ADDRESS=0x...`, optionally `TOKEN_SYMBOL=...`) and save. No rebuild, no restart:
   * the site shows the CA (hero, navbar, footer) within about 30 seconds;
   * the worker notices within a minute, logs `LAUNCH`, and immediately generates and pays the first questions (the first one is a Snowmoon ch.27 decision question when `DECISIONS_PER_DAY` is 1 or more).

Watch it happen with `pm2 logs forecasters-worker`.

## 6. HTTPS

Point the domain's A record to the VPS IP. Put `deploy/Caddyfile` (with your domain) in `/etc/caddy/Caddyfile`, then `sudo systemctl reload caddy`. Caddy obtains and renews the certificate.

## 7. Day to day

```bash
pm2 status
pm2 logs forecasters-worker     # pipeline log
pm2 logs forecasters-web
npm run imd -- wallet           # balances
```

In `/operator`: subsystem LEDs, worker heartbeat, budget, pause switch, WAKE WORKER, per question actions (void, requeue).

Update:

```bash
cd /opt && unzip -o forecasters.zip && cd forecasters && npm ci && npm run build && pm2 reload all
```

## Costs (defaults)

| Item | IMD |
| --- | --- |
| Plain question: forecast job + oracle resolution | 1.0 |
| Decision question (Snowmoon ch.27, 2 or 3 plans): forecast job + which-plan oracle + outcome oracle | 1.5 |
| 3 questions / day, 1 of them a decision | 3.5 / day, about 105 / month |
| Hard cap (`IMD_DAILY_BUDGET`) | 4 / day |

With `FORECAST_JOB_SHAPE=single` each forecaster is its own job (x3 on the forecast part). Plus OpenAI: one small call per hour at most, only while questions are missing for the day.

## What has been verified and what has not

Verified against the real IMD API with free quotes: the payment challenge, the EIP-712 quote approval format, our hashing (`quoteHash`, `requesterScopeHash`), and that IMD accepts our job bodies (chain, single, panel) and oracle bodies (bool and uint256, past tense). Answer formats checked on real attested requests: `bool` comes back as JSON `true`/`false`, `uint256` as a decimal string, both parsed correctly. Verified end to end against a local IMD replica: pay, forecast, collect, resolve, score, for plain and decision questions.

Not yet verified (the first paid run in step 5 settles these):

* an actual settled payment on mainnet;
* that chain steps go to different seats;
* that `OPENAI_MODEL` exists on your OpenAI account (change it in `.env` if not).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `UNSAFE_REQUIREMENTS` | IMD changed price, token or payee. Nothing was signed. Check `npm run imd -- probe`. |
| `DAILY BUDGET REACHED` | expected; resets 00:00 UTC. Raise `IMD_DAILY_BUDGET` if you want more. |
| `not_answerable` then VOID | IMD's oracle refused the question (future, opinion or non public). The worker retries twice, later. |
| `unplannable_steps` | the job shape was rejected; use `FORECAST_JOB_SHAPE=single`. |
| site shows DEMO DATA | `NEXT_PUBLIC_DEMO_MODE=true` or Supabase not set. Fix `.env`, then `npm run build && pm2 reload all`. |
| worker LED amber in /operator | worker not running: `pm2 status`, `pm2 logs forecasters-worker`. |
