#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Journey Benchmark Sprint 3 Reset ==="

# Restart Sprint 3 services
echo "Restarting Sprint 3 Docker services..."
cd "$PROJECT_DIR"
sudo docker compose -f docker-compose.sprint3.yml restart || true

# Clear MailPit messages
echo "Clearing MailPit messages..."
MAILPIT_URL="${MAILPIT_URL:-http://localhost:8025}"
curl -s -X DELETE "${MAILPIT_URL}/api/v1/messages" || echo "MailPit not reachable, skipping clear"

# Reset flight app DB
echo "Reseeding flight app database..."
FLIGHT_CONTAINER=$(sudo docker ps -qf "name=journey-flight-app" 2>/dev/null || true)
if [ -n "$FLIGHT_CONTAINER" ]; then
  sudo docker exec "$FLIGHT_CONTAINER" node src/seed.js
else
  echo "Flight app container not running, skipping reseed"
fi

# Reset auth app DB
echo "Resetting auth app database..."
AUTH_CONTAINER=$(sudo docker ps -qf "name=journey-auth-app" 2>/dev/null || true)
if [ -n "$AUTH_CONTAINER" ]; then
  sudo docker exec "$AUTH_CONTAINER" sh -c "rm -f /data/auth.db && node src/server.js &"
  sleep 2
  sudo docker exec "$AUTH_CONTAINER" sh -c "kill \$(pgrep -f 'node src/server.js') 2>/dev/null || true"
  sudo docker restart "$AUTH_CONTAINER"
else
  echo "Auth app container not running, skipping reset"
fi

echo "=== Reset complete ==="
