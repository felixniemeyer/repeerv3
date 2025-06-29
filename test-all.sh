#!/bin/bash

# Run all tests across the Repeer v3 project
# Usage: ./test-all.sh [--verbose] [--coverage]

set -e

VERBOSE=false
COVERAGE=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --coverage|-c)
            COVERAGE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--verbose] [--coverage]"
            echo "  --verbose, -v    Show detailed test output"
            echo "  --coverage, -c   Generate coverage reports"
            exit 0
            ;;
    esac
done

echo "🧪 Running all tests for Repeer v3..."
echo "=================================="

FAILED_TESTS=()
TOTAL_TESTS=0
PASSED_TESTS=0

run_test() {
    local name="$1"
    local dir="$2"
    local command="$3"
    
    echo ""
    echo "📋 Testing: $name"
    echo "   Directory: $dir"
    echo "   Command: $command"
    echo "   ----------------------------------------"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    cd "$dir"
    
    if $VERBOSE; then
        if eval "$command"; then
            PASSED_TESTS=$((PASSED_TESTS + 1))
            echo "   ✅ PASSED: $name"
        else
            FAILED_TESTS+=("$name")
            echo "   ❌ FAILED: $name"
        fi
    else
        if eval "$command" > /dev/null 2>&1; then
            PASSED_TESTS=$((PASSED_TESTS + 1))
            echo "   ✅ PASSED: $name"
        else
            FAILED_TESTS+=("$name")
            echo "   ❌ FAILED: $name"
        fi
    fi
    
    cd - > /dev/null
}

# Save original directory
ORIGINAL_DIR=$(pwd)

# 1. Rust Trust Node Tests
if [ -d "trust-node" ]; then
    run_test "Rust Trust Node" "trust-node" "cargo test"
fi

# 2. TypeScript Trust Client Tests  
if [ -d "trust-client" ] && [ -f "trust-client/package.json" ]; then
    if grep -q '"test"' trust-client/package.json; then
        run_test "Trust Client" "trust-client" "npm test"
    fi
fi

# 3. Browser Extension Tests
if [ -d "browser-extension" ] && [ -f "browser-extension/package.json" ]; then
    if grep -q '"test"' browser-extension/package.json; then
        run_test "Browser Extension" "browser-extension" "npm test"
    fi
fi

# 4. Adapter Interface Tests
if [ -d "packages/adapter-interface" ]; then
    run_test "Adapter Interface" "packages/adapter-interface" "npm test"
fi

# 5. ID Domain Tests
for domain_dir in packages/id-domains/*/; do
    if [ -d "$domain_dir" ] && [ -f "${domain_dir}package.json" ]; then
        domain_name=$(basename "$domain_dir")
        run_test "ID Domain: $domain_name" "$domain_dir" "npm test"
    fi
done

# 6. Website Adapter Tests
for adapter_dir in packages/website-adapters/*/; do
    if [ -d "$adapter_dir" ] && [ -f "${adapter_dir}package.json" ]; then
        adapter_name=$(basename "$adapter_dir")
        run_test "Website Adapter: $adapter_name" "$adapter_dir" "npm test"
    fi
done

# 7. Integration Tests (if they exist)
if [ -d "tests" ]; then
    if [ -f "tests/package.json" ] && grep -q '"test"' tests/package.json; then
        run_test "Integration Tests" "tests" "npm test"
    elif [ -f "tests/integration.test.ts" ]; then
        # Try to run integration tests with different methods
        if command -v npm > /dev/null && [ -f "tests/package.json" ]; then
            run_test "Integration Tests (npm)" "tests" "npm test"
        elif command -v deno > /dev/null; then
            run_test "Integration Tests (deno)" "tests" "deno test --allow-all"
        fi
    fi
fi

# 8. Demo Tests (if they exist)
if [ -d "demo" ] && [ -f "demo/package.json" ]; then
    if grep -q '"test"' demo/package.json; then
        run_test "Demo" "demo" "npm test"
    fi
fi

# Return to original directory
cd "$ORIGINAL_DIR"

# Summary
echo ""
echo "🏁 Test Summary"
echo "==============="
echo "Total test suites: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $((TOTAL_TESTS - PASSED_TESTS))"

if [ ${#FAILED_TESTS[@]} -eq 0 ]; then
    echo ""
    echo "🎉 All tests passed!"
    exit 0
else
    echo ""
    echo "❌ Failed test suites:"
    for failed_test in "${FAILED_TESTS[@]}"; do
        echo "   - $failed_test"
    done
    echo ""
    echo "💡 Run with --verbose to see detailed error output"
    exit 1
fi