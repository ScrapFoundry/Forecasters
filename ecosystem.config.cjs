// pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
// Two processes on the VPS:
//   forecasters-web     the site (reads .env only; no private keys)
//   forecasters-worker  the pipeline (reads .env + .env.worker)
module.exports = {
  apps: [
    {
      name: "forecasters-web",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_memory_restart: "600M",
      time: true,
    },
    {
      name: "forecasters-worker",
      cwd: __dirname,
      script: "worker/index.ts",
      interpreter: "node",
      interpreter_args: "--conditions=react-server --env-file=.env --env-file=.env.worker --import tsx",
      autorestart: true,
      restart_delay: 30000,
      max_restarts: 50,
      max_memory_restart: "300M",
      kill_timeout: 5000,
      time: true,
    },
  ],
};
