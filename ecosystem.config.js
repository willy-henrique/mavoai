const isWSL = process.env.WSL_DISTRO_NAME || process.env.WSLENV
const APP_DIR = isWSL
  ? "/mnt/c/willydev/chat-inteligente"
  : "/opt/mavoai"

module.exports = {
  apps: [
    {
      name: "mavoai",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: APP_DIR,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env_file: `${APP_DIR}/.env.production`,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/tmp/mavoai-error.log",
      out_file: "/tmp/mavoai-out.log",
      merge_logs: true,
    },
  ],
}
