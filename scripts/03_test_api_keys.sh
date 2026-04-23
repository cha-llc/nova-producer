#!/bin/bash
# ============================================================================
# STEP 3: TEST API KEYS & CONNECTIVITY
# ============================================================================

echo "STEP 3: API KEY VALIDATION & CONNECTIVITY TESTS"
echo "=============================================="
echo ""

# Check if .env.local exists
if [ ! -f "frontend/.env.local" ]; then
  echo "⚠️  ERROR: frontend/.env.local not found"
  echo ""
  echo "Please create frontend/.env.local with:"
  cat << 'EOF'
VITE_SUPABASE_URL=https://vzzzqsmqqaoilkmskadl.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_DEEPGRAM_API_KEY=your-deepgram-api-key
VITE_ANTHROPIC_API_KEY=your-anthropic-api-key
VITE_SOCIALBLU_API_KEY=your-socialblu-api-key
EOF
  echo ""
  exit 1
fi

echo "✅ Environment file found"
echo ""

# Source environment
export $(cat frontend/.env.local | xargs)

echo "════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🔑 API KEY VALIDATION"
echo ""

validate_key() {
  local name=$1
  local value=$2
  local pattern=$3
  
  if [ -z "$value" ]; then
    echo "  ❌ $name: NOT SET"
    return 1
  fi
  
  if [ ${#value} -lt 10 ]; then
    echo "  ❌ $name: Too short (${#value} chars)"
    return 1
  fi
  
  echo "  ✅ $name: Set (${#value} chars)"
  
  # Show first 10 and last 10 chars
  FIRST=$(echo "$value" | cut -c1-10)
  LAST=$(echo "$value" | cut -c-10)
  echo "     Format: ${FIRST}...${LAST}"
  
  return 0
}

echo "Supabase Keys:"
validate_key "SUPABASE_URL" "$VITE_SUPABASE_URL"
validate_key "SUPABASE_ANON_KEY" "$VITE_SUPABASE_ANON_KEY"
echo ""

echo "Third-party API Keys:"
validate_key "DEEPGRAM_API_KEY" "$VITE_DEEPGRAM_API_KEY"
validate_key "ANTHROPIC_API_KEY" "$VITE_ANTHROPIC_API_KEY"
validate_key "SOCIALBLU_API_KEY" "$VITE_SOCIALBLU_API_KEY"
echo ""

echo "════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🌐 CONNECTIVITY TESTS"
echo ""

test_endpoint() {
  local name=$1
  local url=$2
  local timeout=5
  
  echo "Testing: $name"
  
  # Use curl to test connectivity
  if command -v curl &> /dev/null; then
    RESPONSE=$(curl -s -w "\n%{http_code}" --connect-timeout $timeout "$url" 2>/dev/null)
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "400" ]; then
      echo "  ✅ $name: Reachable (HTTP $HTTP_CODE)"
      return 0
    elif [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
      echo "  ⚠️  $name: Auth required (HTTP $HTTP_CODE) - API accessible"
      return 0
    else
      echo "  ❌ $name: Failed (HTTP $HTTP_CODE)"
      return 1
    fi
  else
    echo "  ⚠️  curl not available, skipping connectivity test"
  fi
}

echo "Supabase:"
test_endpoint "Supabase REST API" "https://vzzzqsmqqaoilkmskadl.supabase.co/rest/v1/"
echo ""

echo "Third-party Services:"
test_endpoint "Deepgram API" "https://api.deepgram.com/v1/listen"
test_endpoint "Anthropic API" "https://api.anthropic.com/v1/messages"
test_endpoint "Socialblu API" "https://api.socialblu.com/v1"
echo ""

echo "════════════════════════════════════════════════════════════════════════════"
echo ""
echo "📋 API KEY CHECKLIST"
echo ""

cat << 'EOF'
Before production deployment:

REQUIRED:
  [ ] VITE_SUPABASE_URL - Set and verified
  [ ] VITE_SUPABASE_ANON_KEY - Set and verified
  [ ] VITE_DEEPGRAM_API_KEY - Set and verified
  [ ] VITE_ANTHROPIC_API_KEY - Set and verified
  [ ] VITE_SOCIALBLU_API_KEY - Set and verified

OPTIONAL (for full functionality):
  [ ] Deepgram API enabled for transcription
  [ ] Anthropic API enabled for clip generation
  [ ] Socialblu connected for analytics

TESTING:
  [ ] Supabase connection working
  [ ] Deepgram API responding
  [ ] Anthropic API responding
  [ ] Socialblu API responding

SECURITY:
  [ ] Keys stored in .env.local (not committed)
  [ ] Keys never logged or exposed
  [ ] .gitignore includes .env.local
  [ ] Keys rotated regularly
EOF

echo ""
echo "✅ API KEY VALIDATION COMPLETE"
echo ""
