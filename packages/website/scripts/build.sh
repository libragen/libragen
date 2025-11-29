#!/bin/bash
set -e

# Extract version from @libragen/core package.json
VERSION=$(node -p "require('../../packages/core/package.json').version")
echo "Building with version: $VERSION"

# Site URL (defaults to production)
SITE_URL="${SITE_URL:-https://libragen.dev}"
echo "Site URL: $SITE_URL"

# Clean up any existing library file to avoid SQLite lock issues
rm -f ./dist/libragen-docs-*.libragen

# Build the libragen-docs library (--output as directory uses standard filename)
node ../cli/dist/cli.js build ./src/content/docs \
  --name libragen-docs \
  --version "$VERSION" \
  --content-version "$VERSION" \
  --description 'Official libragen documentation' \
  --output ./dist

# Copy schemas
npm run build:schemas

# Build the website with version env var
PUBLIC_LIBRAGEN_VERSION="$VERSION" astro build --site "$SITE_URL"
