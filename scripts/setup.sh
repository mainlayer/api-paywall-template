#!/bin/bash
set -euo pipefail

MAINLAYER_BASE_URL="https://api.mainlayer.xyz"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo "================================================"
echo "  Mainlayer API Paywall — Interactive Setup"
echo "================================================"
echo ""

# ------------------------------------------------------------------
# 1. Collect API key
# ------------------------------------------------------------------

if [ -n "${MAINLAYER_API_KEY:-}" ]; then
  echo -e "${GREEN}Using MAINLAYER_API_KEY from environment.${NC}"
  API_KEY="$MAINLAYER_API_KEY"
else
  echo "Get your API key at https://app.mainlayer.xyz"
  echo ""
  printf "Enter your Mainlayer API key: "
  read -r API_KEY

  if [ -z "$API_KEY" ]; then
    echo -e "${RED}Error: API key cannot be empty.${NC}"
    exit 1
  fi
fi

# ------------------------------------------------------------------
# 2. Collect resource details
# ------------------------------------------------------------------

echo ""
printf "Resource name (default: 'My API'): "
read -r RESOURCE_NAME
RESOURCE_NAME="${RESOURCE_NAME:-My API}"

printf "Resource description (default: 'Access to My API endpoints'): "
read -r RESOURCE_DESCRIPTION
RESOURCE_DESCRIPTION="${RESOURCE_DESCRIPTION:-Access to My API endpoints}"

printf "Price per call in USD (default: 0.01): "
read -r PRICE_USD
PRICE_USD="${PRICE_USD:-0.01}"

printf "Pricing model — per_call / subscription / credits (default: per_call): "
read -r PRICING_MODEL
PRICING_MODEL="${PRICING_MODEL:-per_call}"

# ------------------------------------------------------------------
# 3. Create the Mainlayer resource
# ------------------------------------------------------------------

echo ""
echo -e "${YELLOW}Creating Mainlayer resource...${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${MAINLAYER_BASE_URL}/resources" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"${RESOURCE_NAME}\",
    \"description\": \"${RESOURCE_DESCRIPTION}\",
    \"pricing\": {
      \"model\": \"${PRICING_MODEL}\",
      \"amount_usd\": ${PRICE_USD}
    }
  }")

HTTP_BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
  echo -e "${RED}Error: Mainlayer API returned ${HTTP_CODE}${NC}"
  echo "$HTTP_BODY"
  exit 1
fi

# Extract resource ID (requires jq)
if command -v jq &> /dev/null; then
  RESOURCE_ID=$(echo "$HTTP_BODY" | jq -r '.id')
else
  RESOURCE_ID=$(echo "$HTTP_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

if [ -z "$RESOURCE_ID" ] || [ "$RESOURCE_ID" = "null" ]; then
  echo -e "${RED}Error: Could not extract resource ID from response.${NC}"
  echo "$HTTP_BODY"
  exit 1
fi

# ------------------------------------------------------------------
# 4. Detect which implementation to configure
# ------------------------------------------------------------------

echo ""
echo -e "${GREEN}Resource created! ID: ${RESOURCE_ID}${NC}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$(dirname "$SCRIPT_DIR")"

write_env() {
  local env_file="$1"
  local example_file="${env_file}.example"

  if [ -f "$example_file" ]; then
    cp "$example_file" "$env_file"
  else
    touch "$env_file"
  fi

  # Replace or append values
  if grep -q "^MAINLAYER_API_KEY=" "$env_file" 2>/dev/null; then
    sed -i.bak "s|^MAINLAYER_API_KEY=.*|MAINLAYER_API_KEY=${API_KEY}|" "$env_file" && rm -f "${env_file}.bak"
  else
    echo "MAINLAYER_API_KEY=${API_KEY}" >> "$env_file"
  fi

  if grep -q "^RESOURCE_ID=" "$env_file" 2>/dev/null; then
    sed -i.bak "s|^RESOURCE_ID=.*|RESOURCE_ID=${RESOURCE_ID}|" "$env_file" && rm -f "${env_file}.bak"
  else
    echo "RESOURCE_ID=${RESOURCE_ID}" >> "$env_file"
  fi

  echo -e "${GREEN}Written: ${env_file}${NC}"
}

printf "Write credentials to .env files? [Y/n]: "
read -r WRITE_ENV
WRITE_ENV="${WRITE_ENV:-Y}"

if [[ "$WRITE_ENV" =~ ^[Yy] ]]; then
  [ -d "${TEMPLATE_DIR}/python" ]     && write_env "${TEMPLATE_DIR}/python/.env"
  [ -d "${TEMPLATE_DIR}/typescript" ] && write_env "${TEMPLATE_DIR}/typescript/.env"
fi

# ------------------------------------------------------------------
# 5. Summary
# ------------------------------------------------------------------

echo ""
echo "================================================"
echo "  Setup complete!"
echo "================================================"
echo ""
echo "  MAINLAYER_API_KEY : ${API_KEY:0:8}..."
echo "  RESOURCE_ID       : ${RESOURCE_ID}"
echo ""
echo "Next steps:"
echo "  Python:     cd python && pip install -r requirements.txt && uvicorn app:app --reload"
echo "  TypeScript: cd typescript && npm install && npm run dev"
echo ""
echo "Full docs: https://docs.mainlayer.xyz"
echo ""
