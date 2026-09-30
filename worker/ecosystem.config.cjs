// pm2 start worker/ecosystem.config.cjs && pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: "forecasters-worker",
      cwd: __dirname + "/..",
      script: "node",
      args: "--conditions=react-server --env-file=.env --import tsx worker/index.ts",
      autorestart: true,
      max_restarts: 50,
      restart_delay: 30000,
      max_memory_restart: "300M",
      time: true,
    },
  ],
};
