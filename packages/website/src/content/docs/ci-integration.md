---
title: CI Integration
description: Automatically build and publish RAG libraries in your CI/CD pipeline
section: Guides
order: 6
---

Automate your RAG library builds so they stay in sync with your documentation. This guide covers integration with popular CI/CD platforms.

## Why Automate?

- **Always current** — Libraries rebuild when docs change
- **Version tracking** — Tag libraries with commit SHAs or release versions
- **Zero manual work** — Set it and forget it
- **Artifact distribution** — Publish libraries alongside your releases

## GitHub Actions

### Using the Official Action

The easiest way to build libraries in GitHub Actions:

```yaml
name: Build RAG Library

on:
  push:
    paths:
      - 'docs/**'
    branches:
      - main

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build library
        uses: libragen/libragen@v1
        with:
          source: ./docs
          name: my-project
          description: 'Documentation for my-project'

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: rag-library
          path: '*.libragen'
```

### Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `source` | Yes | `./docs` | Source directory containing docs |
| `name` | Yes | — | Library name |
| `version` | No | — | Library version (adds to filename) |
| `description` | No | — | Library description |
| `output` | No | `.` | Output directory |
| `chunk-size` | No | — | Target chunk size |
| `chunk-overlap` | No | — | Chunk overlap |
| `extensions` | No | — | File extensions (comma-separated) |
| `exclude` | No | — | Exclude patterns (comma-separated) |
| `cache-model` | No | `true` | Cache embedding model |

### Action Outputs

| Output | Description |
|--------|-------------|
| `library-path` | Full path to generated library |
| `library-name` | Filename of generated library |

### On Release

Build libraries when you create a release:

```yaml
name: Release RAG Library

on:
  release:
    types: [published]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build library
        id: build
        uses: libragen/libragen@v1
        with:
          source: ./docs
          name: my-project
          version: ${{ github.event.release.tag_name }}

      - name: Upload to release
        uses: softprops/action-gh-release@v1
        with:
          files: ${{ steps.build.outputs.library-path }}
```

### Caching the Model

The official action caches the embedding model by default. To disable caching:

```yaml
- uses: libragen/libragen@v1
  with:
    source: ./docs
    name: my-project
    cache-model: 'false'
```

For manual setups without the action, cache `~/.libragen/models`:

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.libragen/models
    key: libragen-model-v1
```

## GitLab CI

Create `.gitlab-ci.yml`:

```yaml
build-rag-library:
  image: node:24
  stage: build
  script:
    - libragen build ./docs --name my-project --version $CI_COMMIT_TAG
  artifacts:
    paths:
      - "*.libragen"
  only:
    - tags
  cache:
    paths:
      - ~/.libragen/models
```

## CircleCI

Create `.circleci/config.yml`:

```yaml
version: 2.1

jobs:
  build-library:
    docker:
      - image: cimg/node:24.0
    steps:
      - checkout
      - restore_cache:
          keys:
            - libragen-model-v1
      - run:
          name: Build RAG library
          command: |
            libragen build ./docs \
              --name my-project \
              --version ${CIRCLE_TAG:-$CIRCLE_SHA1}
      - save_cache:
          key: libragen-model-v1
          paths:
            - ~/.libragen/models
      - store_artifacts:
          path: my-project-*.libragen

workflows:
  build:
    jobs:
      - build-library:
          filters:
            tags:
              only: /.*/
```

## Azure Pipelines

Create `azure-pipelines.yml`:

```yaml
trigger:
  paths:
    include:
      - docs/*

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '24.x'

  - script: |
      libragen build ./docs \
        --name my-project \
        --version $(Build.SourceVersion)
    displayName: 'Build RAG library'

  - task: PublishBuildArtifacts@1
    inputs:
      pathToPublish: '$(System.DefaultWorkingDirectory)/my-project-*.libragen'
      artifactName: 'rag-library'
```

## Publishing to Collections

After building, publish your library to a collection for easy distribution:

```yaml
# After build step
- name: Publish to collection
  run: |
    # Upload to your collection server
    curl -X POST \
      -H "Authorization: Bearer ${{ secrets.COLLECTION_TOKEN }}" \
      -F "library=@my-project-*.libragen" \
      https://collections.example.com/api/upload
```

## Environment Variables

Customize the build with environment variables:

| Variable | Description |
|----------|-------------|
| `LIBRAGEN_HOME` | Base directory for libragen data |
| `LIBRAGEN_MODEL_CACHE` | Custom model cache location |

```yaml
- name: Build with custom paths
  env:
    LIBRAGEN_MODEL_CACHE: /tmp/models
  run: libragen build ./docs --name my-project
```

## Best Practices

1. **Cache the model** — The embedding model is ~50MB. Cache it to speed up builds.

2. **Use semantic versions** — Tag libraries with your release versions for easy reference.

3. **Build on doc changes only** — Use path filters to avoid unnecessary builds.

4. **Store as artifacts** — Attach libraries to releases for easy distribution.

5. **Validate before publishing** — Run a quick query to verify the library works:
   ```yaml
   - name: Validate library
     run: |
       libragen query \
         --library ./my-project-*.libragen \
         "test query" \
         --top-k 1
   ```

## Monorepo Setup

For monorepos with multiple doc sets:

```yaml
jobs:
  build:
    strategy:
      matrix:
        include:
          - name: api-docs
            path: packages/api/docs
          - name: sdk-docs
            path: packages/sdk/docs
    steps:
      - uses: actions/checkout@v4
      - run: |
          libragen build ./${{ matrix.path }} \
            --name ${{ matrix.name }} \
            --version ${{ github.ref_name }}
```

## Need Help?

See the [Troubleshooting guide](/docs/troubleshooting) for solutions to common CI issues.
