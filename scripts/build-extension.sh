#!/bin/bash

# Comprehensive Azure DevOps Extension Build Script
# Usage: ./scripts/build-extension.sh [--clean] [--skip-tests] [--skip-lint] [--verbose]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default options
CLEAN=false
SKIP_TESTS=false
SKIP_LINT=false
VERBOSE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-lint)
            SKIP_LINT=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--clean] [--skip-tests] [--skip-lint] [--verbose]"
            echo ""
            echo "Options:"
            echo "  --clean       Clean dist directory before building"
            echo "  --skip-tests  Skip running tests"
            echo "  --skip-lint   Skip linting and formatting checks"
            echo "  --verbose     Enable verbose output"
            echo "  -h, --help    Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_step() {
    echo -e "${BLUE}🔨 $1${NC}"
}

# Get project root directory
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$PROJECT_ROOT"

log_info "Building Azure DevOps Extension..."
log_info "Project root: $PROJECT_ROOT"

# Clean dist directory if requested
if [ "$CLEAN" = true ]; then
    log_step "Cleaning dist directory..."
    rm -rf dist
    log_success "Cleaned dist directory"
fi

# Create dist directory
log_step "Creating dist directory..."
mkdir -p dist

# Check Node.js version
log_step "Checking Node.js version..."
NODE_VERSION=$(node --version)
log_info "Node.js version: $NODE_VERSION"

# Check if we have minimum required Node.js version (22.x)
REQUIRED_VERSION="22.0.0"
if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    log_warning "Node.js version $NODE_VERSION might be too old. Recommended: 22.x or higher"
fi

# Install dependencies
log_step "Installing dependencies..."
if [ "$VERBOSE" = true ]; then
    pnpm install
else
    pnpm install --silent
fi
log_success "Dependencies installed"

# Run linting and formatting checks
if [ "$SKIP_LINT" = false ]; then
    log_step "Running linting and formatting checks..."

    # Check formatting
    if pnpm run format:check; then
        log_success "Code formatting is correct"
    else
        log_error "Code formatting check failed"
        log_info "Run 'pnpm run format' to fix formatting issues"
        exit 1
    fi

    # Type checking
    if pnpm run typecheck; then
        log_success "TypeScript type checking passed"
    else
        log_error "TypeScript type checking failed"
        exit 1
    fi
else
    log_warning "Skipping linting and formatting checks"
fi

# Run tests
if [ "$SKIP_TESTS" = false ]; then
    log_step "Running tests..."
    if pnpm test; then
        log_success "All tests passed"
    else
        log_error "Tests failed"
        exit 1
    fi
else
    log_warning "Skipping tests"
fi

# Bundle with esbuild
log_step "Bundling with esbuild..."
if npx esbuild src/azure-pipeline.ts \
    --bundle \
    --platform=node \
    --target=node22 \
    --format=cjs \
    --outfile=dist/azure-pipeline.js \
    --external:azure-pipelines-task-lib; then
    log_success "esbuild bundle successful"
else
    log_error "esbuild bundle failed"
    exit 1
fi

# Copy task.json to dist
log_step "Copying task.json to dist..."
cp task.json dist/
log_success "task.json copied"

# Copy additional required files
log_step "Copying additional files..."
if [ -f "LICENSE" ]; then
    cp LICENSE dist/
    log_success "LICENSE copied"
fi

# Install azure-pipelines-task-lib (sole external dependency) in dist
# This package must remain external because it reads lib.json at runtime via __dirname.
# A minimal package.json is required so npm does not traverse up to the workspace root.
log_step "Installing azure-pipelines-task-lib in dist..."
cd dist
echo '{}' > package.json
if [ "$VERBOSE" = true ]; then
    npm install azure-pipelines-task-lib --omit=dev --no-package-lock
else
    npm install azure-pipelines-task-lib --omit=dev --no-package-lock --silent
fi
rm package.json
cd ..
log_success "azure-pipelines-task-lib installed in dist"

# Validate build output
log_step "Validating build output..."

# Check required files exist
REQUIRED_FILES=(
    "dist/azure-pipeline.js"
    "dist/task.json"
    "dist/node_modules/azure-pipelines-task-lib"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -e "$file" ]; then
        log_error "Required file missing: $file"
        exit 1
    fi
done

# Check bundled JavaScript file is valid
log_step "Validating JavaScript bundle..."
if node -c "dist/azure-pipeline.js" 2>/dev/null; then
    log_success "azure-pipeline.js is valid"
else
    log_error "Invalid JavaScript bundle: dist/azure-pipeline.js"
    exit 1
fi

# Check task.json is valid
log_step "Validating task.json..."
if node -e "JSON.parse(require('fs').readFileSync('dist/task.json', 'utf8'))" 2>/dev/null; then
    log_success "task.json is valid JSON"
else
    log_error "task.json is invalid JSON"
    exit 1
fi

# Check version consistency
log_step "Checking version consistency..."
PACKAGE_VERSION=$(node -p "require('./package.json').version")
VSS_VERSION=$(node -p "require('./vss-extension.json').version")
TASK_VERSION=$(node -p "const task = require('./dist/task.json'); \`\${task.version.Major}.\${task.version.Minor}.\${task.version.Patch}\`")

log_info "Package.json version: $PACKAGE_VERSION"
log_info "vss-extension.json version: $VSS_VERSION"
log_info "task.json version: $TASK_VERSION"

if [ "$VSS_VERSION" != "$TASK_VERSION" ]; then
    log_error "Version mismatch between vss-extension.json ($VSS_VERSION) and task.json ($TASK_VERSION)"
    exit 1
fi

log_success "Version consistency check passed"

# Show build summary
log_step "Build Summary"
echo "=================================="
echo "🏗️  Build completed successfully!"
echo "📦 Package version: $PACKAGE_VERSION"
echo "📂 Output directory: dist/"
echo "📋 Files built:"

if [ "$VERBOSE" = true ]; then
    ls -la dist/
else
    ls -1 dist/ | sed 's/^/    /'
fi

echo "=================================="
log_success "Azure DevOps Extension build completed successfully!"
log_info "Next steps:"
echo "  1. Run tests: pnpm test"
echo "  2. Create VSIX: pnpm run create:vsix"
echo "  3. Publish: pnpm run publish:extension"
