#!/bin/bash

# Simple test data generator for federation demonstration
# Adds trust experiences to different nodes for the same Ethereum address
# This demonstrates how federation works - each node has its own experiences
# but can query peers for their experiences

set -e

# Port configuration
ALICE_API_PORT=8080
BOB_API_PORT=8081
CHARLIE_API_PORT=8082

# Test Ethereum address that appears in demo/test-page.html
TEST_ADDRESS="ethereum:0x1234567890123456789012345678901234567890"

echo "🌟 Generating test data for federation demo..."

# Check if nodes are running
if ! curl -s http://localhost:$ALICE_API_PORT/health > /dev/null; then
    echo "❌ Alice node not running on port $ALICE_API_PORT"
    echo "Please run: ./run_test_nodes.sh"
    exit 1
fi

echo "✓ Nodes are running"

# Add experience to Alice (Good experience)
echo "Adding experience to Alice..."
curl -s -X POST http://localhost:$ALICE_API_PORT/experiences \
    -H 'Content-Type: application/json' \
    -d "{
        \"agent_id\": \"$TEST_ADDRESS\",
        \"investment\": 1000,
        \"return_value\": 1200,
        \"timeframe_days\": 30,
        \"notes\": \"Great DeFi protocol with consistent returns\"
    }" > /dev/null

# Add experience to Bob (Decent experience)
echo "Adding experience to Bob..."
curl -s -X POST http://localhost:$BOB_API_PORT/experiences \
    -H 'Content-Type: application/json' \
    -d "{
        \"agent_id\": \"$TEST_ADDRESS\",
        \"investment\": 500,
        \"return_value\": 550,
        \"timeframe_days\": 15,
        \"notes\": \"Decent returns, no issues\"
    }" > /dev/null

# Add experience to Charlie (Mixed experience)
echo "Adding experience to Charlie..."
curl -s -X POST http://localhost:$CHARLIE_API_PORT/experiences \
    -H 'Content-Type: application/json' \
    -d "{
        \"agent_id\": \"$TEST_ADDRESS\",
        \"investment\": 800,
        \"return_value\": 760,
        \"timeframe_days\": 45,
        \"notes\": \"Some volatility but overall stable\"
    }" > /dev/null

echo ""
echo "✅ Test data generated successfully!"
echo ""
echo "📊 Experiences added:"
echo "  Alice:   \$1000 → \$1200 (ROI: 1.2, 20% gain) over 30 days"
echo "  Bob:     \$500 → \$550 (ROI: 1.1, 10% gain) over 15 days"  
echo "  Charlie: \$800 → \$760 (ROI: 0.95, 5% loss) over 45 days"
echo ""
echo "🎯 Test federation:"
echo "1. Connect browser extension to Alice (http://localhost:$ALICE_API_PORT)"
echo "2. Visit: https://etherscan.io/address/0x1234567890123456789012345678901234567890"
echo "3. See trust indicator with Alice's experience"
echo "4. Switch to Bob (http://localhost:$BOB_API_PORT)"
echo "5. Refresh page → See combined trust score from federation!"
echo ""
echo "📝 Test address: $TEST_ADDRESS"