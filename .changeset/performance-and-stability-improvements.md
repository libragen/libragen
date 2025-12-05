---
"@libragen/core": patch
"@libragen/cli": patch  
"@libragen/mcp": patch
---

**Performance Improvements:**
- Refactor time estimation with config objects for better maintainability
- Implement lazy embedder initialization with background warming for faster startup

**Features:**
- Upgrade Commander.js to v14 with enhanced TypeScript support, providing better type inference and developer experience

**Fixes:**
- Make VERSION constant dynamically read from package.json instead of being hardcoded

**Refactoring:**
- Remove legacy markings from collection search functionality
- Remove legacy marking from collection install option

**Documentation:**
- Update CLI usage examples and workflow in README
- Add quick setup and usage examples to MCP README
- Fix CLI install command syntax in marketing copy
- Update collections description to focus on team use case
