---
title: Collections
description: Bundle and share multiple libraries together
section: Guides
order: 4
---

Collections let you bundle multiple libraries into a single installable package. They're useful for sharing curated sets of documentation with your team or organizing related libraries together.

## Creating a Collection

### 1. Build your libraries

First, create the individual libraries you want to include:

```bash
libragen build ./api-docs --name internal-api
libragen build ./guides --name internal-guides
libragen build ./onboarding --name onboarding-docs
```

### 2. Create a collection file

Use the `collection create` command to bundle libraries together:

```bash
# Create with libraries specified
libragen collection create my-team-docs \
  --library ./internal-api.libragen \
  --library ./internal-guides.libragen \
  --library ./onboarding-docs.libragen \
  --description "Internal documentation for the team"

# Or create a template to edit manually
libragen collection create my-team-docs
```

This creates a `my-team-docs.json` collection file. If no libraries are specified, a template is created that you can edit manually.

### 3. Collection file format

Collections are JSON files that reference library locations:

```json
{
  "name": "my-team-docs",
  "version": "1.0.0",
  "description": "Internal documentation for the team",
  "libraries": [
    {
      "name": "internal-api",
      "version": "1.0.0",
      "description": "Internal API documentation",
      "url": "./internal-api.libragen"
    },
    {
      "name": "internal-guides",
      "version": "1.0.0",
      "description": "Internal engineering guides",
      "url": "./internal-guides.libragen"
    }
  ]
}
```

Library URLs can be:
- **Relative paths** - `./libs/my-lib.libragen`
- **Absolute paths** - `/shared/libs/my-lib.libragen`
- **HTTP URLs** - `https://internal.example.com/libs/my-lib.libragen`

## Installing from a Collection

Install all libraries from a collection at once:

```bash
# From a local collection file
libragen install --from ./my-team-docs.json

# From a URL
libragen install --from https://internal.example.com/collections/team-docs.json
```

## Hosting Collections

For team sharing, host your collection and libraries on any file server:

### Simple file share

```
/shared/libragen/
├── collections/
│   └── team-docs.json
└── libraries/
    ├── internal-api-1.0.0.libragen
    ├── internal-guides-1.0.0.libragen
    └── onboarding-docs-1.0.0.libragen
```

### HTTP server or S3

Upload files to any HTTP-accessible location and reference them by URL in your collection.

## Managing Libraries

### List installed libraries

```bash
libragen list
```

### Install a single library

```bash
# From a local file
libragen install ./path/to/library.libragen

# From a URL
libragen install https://example.com/my-lib.libragen
```

### Remove a library

```bash
libragen uninstall my-library
```

## Packing Collections for Sharing

Bundle a collection and all its libraries into a single `.libragen-collection` file for easy distribution:

```bash
# Pack a collection into a single file
libragen collection pack ./my-team-docs.json

# Creates: my-team-docs.libragen-collection
```

Recipients can inspect, unpack, or install directly:

```bash
# Inspect contents without extracting
libragen inspect my-team-docs.libragen-collection

# Unpack to current directory
libragen collection unpack my-team-docs.libragen-collection

# Or install directly (extracts to temp and installs)
libragen install my-team-docs.libragen-collection

# Or unpack and install in one step
libragen collection unpack my-team-docs.libragen-collection --install
```

This is ideal for:
- Sharing collections via email or chat
- Distributing to air-gapped environments
- Bundling documentation with project releases

## Best Practices

1. **Version your collections** - Include version numbers in collection files for reproducibility
2. **Use relative paths for portability** - When distributing collections with libraries, use relative paths
3. **Pack for offline sharing** - Use `collection pack` when recipients don't have network access to your library URLs
4. **Cache in CI** - Store `.libragen` files in your CI cache to speed up builds
5. **Keep libraries updated** - Rebuild libraries when source documentation changes
