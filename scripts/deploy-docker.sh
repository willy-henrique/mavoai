#!/bin/bash
# ============================================================
# Mavo AI — Deploy via Docker no servidor Linux
# Uso: bash scripts/deploy-docker.sh
# ============================================================

set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "╔══════════════════════════════════════════╗"
echo "║       MAVO AI — Deploy Docker            ║"
echo "╚══════════════════════════════════════════╝"

# ── Verifica .env.production ────────────────────────────────
if [ ! -f ".env.production" ]; then
  echo "⚠ .env.production não encontrado!"
  echo "  cp .env.production.example .env.production && nano .env.production"
  exit 1
fi

# ── Para containers antigos ──────────────────────────────────
echo "⏹  Parando containers anteriores..."
docker compose -f docker-compose.prod.yml down --remove-orphans 2>/dev/null || true

# ── Build + sobe tudo ────────────────────────────────────────
echo "🔨 Build da imagem Docker..."
docker compose -f docker-compose.prod.yml build --no-cache

echo "🚀 Subindo serviços..."
docker compose -f docker-compose.prod.yml up -d

# ── Aguarda health check ─────────────────────────────────────
echo "⏳ Aguardando app ficar saudável..."
for i in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec app wget -qO- http://localhost:3000/api/health 2>/dev/null | grep -q "ok\|healthy"; then
    break
  fi
  sleep 3
done

# ── Status final ─────────────────────────────────────────────
echo ""
docker compose -f docker-compose.prod.yml ps
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅ Deploy concluído!"
echo "║  App: http://$LOCAL_IP:3000"
echo "║  Webhook: http://$LOCAL_IP:3000/api/ingestao/mtalk"
echo "║"
echo "║  Logs: docker compose -f docker-compose.prod.yml logs -f app"
echo "║  Parar: docker compose -f docker-compose.prod.yml down"
echo "╚══════════════════════════════════════════╝"
