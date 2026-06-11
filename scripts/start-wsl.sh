#!/bin/bash
# ============================================================
# Mavo AI — Script de inicialização no WSL / Linux
# Uso: bash scripts/start-wsl.sh
# ============================================================

set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="/tmp/mavoai-logs"
ENV_FILE="$APP_DIR/.env.production"

echo "╔══════════════════════════════════════════╗"
echo "║         MAVO AI — Iniciando...           ║"
echo "╚══════════════════════════════════════════╝"

# ── Verifica .env.production ────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo "⚠ .env.production não encontrado!"
  echo "  Copie o exemplo: cp .env.production.example .env.production"
  echo "  Edite com seus dados: nano .env.production"
  exit 1
fi

# ── Cria pasta de logs ──────────────────────────────────────
mkdir -p "$LOG_DIR"

cd "$APP_DIR"

# ── Instala dependências se necessário ──────────────────────
if [ ! -d "node_modules" ]; then
  echo "📦 Instalando dependências..."
  npm ci --omit=dev
fi

# ── Build de produção ────────────────────────────────────────
echo "🔨 Gerando build de produção..."
NODE_ENV=production npm run build

# ── Inicia com PM2 ──────────────────────────────────────────
if command -v pm2 &> /dev/null; then
  echo "🚀 Iniciando com PM2..."
  pm2 delete mavoai 2>/dev/null || true
  pm2 start ecosystem.config.js --env production
  pm2 save
  echo ""
  echo "✅ Mavo AI rodando via PM2"
  echo "   pm2 logs mavoai    — ver logs"
  echo "   pm2 stop mavoai    — parar"
  echo "   pm2 restart mavoai — reiniciar"
else
  echo "⚠ PM2 não encontrado. Instalando..."
  npm install -g pm2
  pm2 start ecosystem.config.js --env production
  pm2 startup
  pm2 save
fi

# ── Mostra IP local para configurar MTalk ──────────────────
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  App rodando em http://$LOCAL_IP:3000"
echo "║  Webhook MTalk: http://$LOCAL_IP:3000/api/ingestao/mtalk"
echo "╚══════════════════════════════════════════╝"
