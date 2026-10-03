module.exports = {
  apps: [{
    name: 'ihealth-amazon-report',
    script: './server.mjs',
    interpreter: 'node',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: { NODE_ENV: 'production', PORT: 3000, HOST: '127.0.0.1' },
  }],
};
