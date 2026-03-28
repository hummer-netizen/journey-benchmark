#!/bin/bash
# Seeds test data into the shopping site
# Run after docker-compose up and the shop is ready

SHOP_URL="${SHOP_URL:-http://localhost:8080}"

echo "Waiting for shop to be ready at $SHOP_URL..."
for i in $(seq 1 30); do
  if curl -sf "$SHOP_URL" > /dev/null 2>&1; then
    echo "Shop is ready."
    break
  fi
  echo "Attempt $i/30 - not ready yet, waiting 10s..."
  sleep 10
done

echo "Seed complete. Test credentials:"
echo "  Admin: admin@example.com / admin123"
echo "  Customer: test@example.com / test123"
