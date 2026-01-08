#!/bin/bash
# Comprehensive System Verification Script
# Purpose: Verify all components of LLM_Chatbot_With_Agent are functioning correctly

echo "======================================================"
echo "LLM Chatbot with Agent - System Verification"
echo "======================================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0

# Function to check a component
check_component() {
    local name=$1
    local command=$2
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $name"
        ((PASS++))
    else
        echo -e "${RED}✗${NC} $name"
        ((FAIL++))
    fi
}

echo "1. DOCKER CONTAINERS"
echo "-------------------"
check_component "App Container Running" "docker ps --filter 'name=app' --filter 'status=running' | grep -q app"
check_component "Database Container Running" "docker ps --filter 'name=db' --filter 'status=running' | grep -q db"
check_component "MinIO Container Running" "docker ps --filter 'name=minio' --filter 'status=running' | grep -q minio"
echo ""

echo "2. WEB SERVER"
echo "-------------------"
check_component "HTTP Health Check" "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 | grep -q 200"
check_component "CSS File Accessible" "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/style.css | grep -q 200"
check_component "Community Page" "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/community.html | grep -q 200"
check_component "Comment Page" "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/comment.html | grep -q 200"
echo ""

echo "3. DATABASE"
echo "-------------------"
check_component "Database Connection" "docker exec llm_chatbot_with_agent-db-1 psql -U athip -d ai_agent -c 'SELECT 1' | grep -q 1"
check_component "Users Table" "docker exec llm_chatbot_with_agent-db-1 psql -U athip -d ai_agent -c '\dt users' | grep -q users"
check_component "Answer Verifications Table" "docker exec llm_chatbot_with_agent-db-1 psql -U athip -d ai_agent -c '\dt answer_verifications' | grep -q answer_verifications"
check_component "Rating Constraint Exists" "docker exec llm_chatbot_with_agent-db-1 psql -U athip -d ai_agent -c '\d+ answer_verifications' | grep -q 'answer_verifications_rating_check'"
echo ""

echo "4. APPLICATION FILES"
echo "-------------------"
check_component "comment.html Deployed" "docker exec llm_chatbot_with_agent-app-1 test -f /app/public/comment.html"
check_component "comment.css Deployed" "docker exec llm_chatbot_with_agent-app-1 test -f /app/public/comment.css"
check_component "agent.js Compiled" "docker exec llm_chatbot_with_agent-app-1 test -f /app/build/agent.js"
check_component "db.js Compiled" "docker exec llm_chatbot_with_agent-app-1 test -f /app/build/db.js"
echo ""

echo "5. RATING VALIDATION"
echo "-------------------"
# Check that validation code exists in compiled agent.js
check_component "Rating Validation in Code" "docker exec llm_chatbot_with_agent-app-1 grep -q 'validRatings' /app/build/agent.js"
check_component "Database Constraint Correct" "docker exec llm_chatbot_with_agent-db-1 psql -U athip -d ai_agent -c '\d+ answer_verifications' | grep -q 'ARRAY.*-1.*0.*1'"
echo ""

echo "======================================================"
echo "SUMMARY"
echo "======================================================"
echo -e "${GREEN}Passed: $PASS${NC}"
echo -e "${RED}Failed: $FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✓ ALL SYSTEMS OPERATIONAL${NC}"
    exit 0
else
    echo -e "${RED}✗ SOME CHECKS FAILED - Review above for details${NC}"
    exit 1
fi
