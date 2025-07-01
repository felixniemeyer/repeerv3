#!/bin/bash

# Script to run multiple trust nodes for manual testing
# Each node gets its own database and ports

set -e

# Port configuration
ALICE_API_PORT=8080
ALICE_P2P_PORT=9015

BOB_API_PORT=8081
BOB_P2P_PORT=9016

CHARLIE_API_PORT=8082
CHARLIE_P2P_PORT=9017

# Build first
echo "Building trust-node..."
cargo build --release

# Create data directory
mkdir -p ./test_data

# Function to run a node
run_node() {
    local user=$1
    local api_port=$2
    local p2p_port=$3
    local bootstrap_peers=$4
    
    echo "Starting node for user: $user (API: $api_port, P2P: $p2p_port)"
    
    if [ -n "$bootstrap_peers" ]; then
        ./target/release/trust-node \
            --user "$user" \
            --api-port "$api_port" \
            --p2p-port "$p2p_port" \
            --data-dir ./test_data \
            --bootstrap-peers "$bootstrap_peers" &
    else
        ./target/release/trust-node \
            --user "$user" \
            --api-port "$api_port" \
            --p2p-port "$p2p_port" \
            --data-dir ./test_data &
    fi
    
    local pid=$!
    echo "Started $user (PID: $pid)"
}

# Stop any existing nodes
echo "Stopping any existing nodes..."
pkill -f "trust-node" || true
sleep 2

# Start Alice (bootstrap node)
echo "=== Starting Alice (bootstrap node) ==="
run_node "alice" $ALICE_API_PORT $ALICE_P2P_PORT
alice_pid=$!
sleep 3

# Get Alice's peer ID for bootstrapping
echo "Waiting for Alice's peer ID..."
sleep 2

# Try to get the peer ID from the node
alice_peer_id=""
for i in {1..10}; do
    if alice_peer_id=$(curl -s http://localhost:$ALICE_API_PORT/peers/self 2>/dev/null | tr -d '"'); then
        if [ "$alice_peer_id" != "null" ] && [ -n "$alice_peer_id" ]; then
            break
        fi
    fi
    echo "Waiting for Alice to start... (attempt $i)"
    sleep 2
done

if [ -z "$alice_peer_id" ] || [ "$alice_peer_id" = "null" ]; then
    echo "Failed to get Alice's peer ID"
    exit 1
fi

echo "Alice's peer ID: $alice_peer_id"

# Start Bob
echo "=== Starting Bob ==="
bob_bootstrap="/ip4/127.0.0.1/tcp/$ALICE_P2P_PORT/p2p/$alice_peer_id"
run_node "bob" $BOB_API_PORT $BOB_P2P_PORT "$bob_bootstrap"
bob_pid=$!
sleep 2

# Start Charlie
echo "=== Starting Charlie ==="
charlie_bootstrap="/ip4/127.0.0.1/tcp/$ALICE_P2P_PORT/p2p/$alice_peer_id"
run_node "charlie" $CHARLIE_API_PORT $CHARLIE_P2P_PORT "$charlie_bootstrap"
charlie_pid=$!
sleep 2

echo ""
echo "=== All nodes started ==="
echo "Alice:   API http://localhost:$ALICE_API_PORT, P2P $ALICE_P2P_PORT (PID: $alice_pid)"
echo "Bob:     API http://localhost:$BOB_API_PORT, P2P $BOB_P2P_PORT (PID: $bob_pid)"  
echo "Charlie: API http://localhost:$CHARLIE_API_PORT, P2P $CHARLIE_P2P_PORT (PID: $charlie_pid)"
echo ""

# Set up peer connections for federation testing
echo "=== Setting up peer connections ==="

# Get peer IDs for connection setup
bob_peer_id=$(curl -s http://localhost:$BOB_API_PORT/peers/self 2>/dev/null | tr -d '"')
charlie_peer_id=$(curl -s http://localhost:$CHARLIE_API_PORT/peers/self 2>/dev/null | tr -d '"')

if [ -n "$bob_peer_id" ] && [ -n "$charlie_peer_id" ]; then
    echo "Setting up Alice's peers..."
    
    # Alice adds Bob (quality: 0.5) and Charlie (quality: 0.25)
    curl -s -X POST http://localhost:$ALICE_API_PORT/peers \
        -H 'Content-Type: application/json' \
        -d "{\"peer_id\":\"/ip4/127.0.0.1/tcp/$BOB_P2P_PORT/p2p/$bob_peer_id\",\"name\":\"Bob\",\"recommender_quality\":0.5}" \
        > /dev/null
    
    curl -s -X POST http://localhost:$ALICE_API_PORT/peers \
        -H 'Content-Type: application/json' \
        -d "{\"peer_id\":\"/ip4/127.0.0.1/tcp/$CHARLIE_P2P_PORT/p2p/$charlie_peer_id\",\"name\":\"Charlie\",\"recommender_quality\":0.25}" \
        > /dev/null
    
    echo "Setting up Bob's peers..."
    
    # Bob adds Alice (quality: 0.8) and Charlie (quality: 0.3)
    curl -s -X POST http://localhost:$BOB_API_PORT/peers \
        -H 'Content-Type: application/json' \
        -d "{\"peer_id\":\"/ip4/127.0.0.1/tcp/$ALICE_P2P_PORT/p2p/$alice_peer_id\",\"name\":\"Alice\",\"recommender_quality\":0.8}" \
        > /dev/null
        
    curl -s -X POST http://localhost:$BOB_API_PORT/peers \
        -H 'Content-Type: application/json' \
        -d "{\"peer_id\":\"/ip4/127.0.0.1/tcp/$CHARLIE_P2P_PORT/p2p/$charlie_peer_id\",\"name\":\"Charlie\",\"recommender_quality\":0.3}" \
        > /dev/null
    
    echo "Setting up Charlie's peers..."
    
    # Charlie adds Alice only (quality: 0.6)
    curl -s -X POST http://localhost:$CHARLIE_API_PORT/peers \
        -H 'Content-Type: application/json' \
        -d "{\"peer_id\":\"/ip4/127.0.0.1/tcp/$ALICE_P2P_PORT/p2p/$alice_peer_id\",\"name\":\"Alice\",\"recommender_quality\":0.6}" \
        > /dev/null
    
    echo "✓ Peer connections established"
    echo "  Alice ↔ Bob (0.5), Alice ↔ Charlie (0.25)"
    echo "  Bob ↔ Alice (0.8), Bob ↔ Charlie (0.3)"  
    echo "  Charlie ↔ Alice (0.6)"
else
    echo "⚠ Could not retrieve peer IDs, skipping peer setup"
fi

echo ""
echo "=== Federation ready for testing ==="
echo "Browser extension can connect to any node:"
echo "  http://localhost:$ALICE_API_PORT (Alice)"
echo "  http://localhost:$BOB_API_PORT (Bob)"
echo "  http://localhost:$CHARLIE_API_PORT (Charlie)"
echo ""
echo "Press Ctrl+C to stop all nodes"

# Wait for interrupt
trap 'echo "Stopping all nodes..."; pkill -f "trust-node"; exit' INT
wait