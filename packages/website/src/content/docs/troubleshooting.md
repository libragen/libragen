---
title: Troubleshooting
description: Solutions to common issues with libragen
section: Guides
order: 10
---

This guide covers common issues and their solutions when using libragen.

## Installation Issues

### `npx` command not found

**Cause:** Node.js is not installed or not in your PATH.

**Solution:**
1. Install Node.js 24+ from [nodejs.org](https://nodejs.org)
2. Verify installation: `node --version`
3. Restart your terminal

### Permission errors on install

**Cause:** npm global directory requires elevated permissions.

**Solution:**
```bash
# Option 1: Use npx (no global install needed)
libragen build ./docs --name my-docs

# Option 2: Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

## Build Issues

### Build is slow on first run

**Cause:** The embedding model (~50MB) must be downloaded on first use.

**Solution:** This is expected. Subsequent builds will be faster as the model is cached in `~/.libragen/models/` (or `$LIBRAGEN_MODEL_CACHE`).

### Out of memory errors

**Cause:** Processing too many large files at once.

**Solutions:**
1. Reduce chunk size: `--chunk-size 256`
2. Exclude large files: `--exclude "**/*.pdf" --exclude "**/images/**"`
3. Process directories separately and combine results
4. Increase Node.js memory: `NODE_OPTIONS="--max-old-space-size=4096" libragen build ...`

### No chunks created

**Cause:** No supported files found, or all files excluded.

**Solutions:**
1. Check file extensions - only `.md`, `.txt`, `.html`, `.mdx` are processed by default
2. Add custom extensions: `--extensions ".rst,.adoc"`
3. Check exclude patterns aren't too broad
4. Verify source path is correct

### "ENOENT: no such file or directory"

**Cause:** Source path doesn't exist or is inaccessible.

**Solutions:**
1. Verify the path exists: `ls ./docs`
2. Use absolute path if relative path fails
3. Check file permissions

## Query Issues

### No results returned

**Cause:** Query doesn't match indexed content, or library is empty.

**Solutions:**
1. Check library has content: `libragen inspect my-library.libragen`
2. Try broader search terms
3. Use keywords that appear in your docs
4. Rebuild with smaller chunk size for more granular results

### Poor quality results

**Cause:** Chunks are too large/small, or content isn't well-structured.

**Solutions:**
1. Adjust chunk size (see [Building Libraries](/docs/building#chunking-strategy))
2. Ensure source docs have clear headings and sections
3. Try different query phrasing
4. Rebuild library after improving source documentation structure

### "Library not found"

**Cause:** Library file doesn't exist at the expected path.

**Solutions:**
1. Check library exists: `libragen list`
2. Verify library path: `libragen config`
3. Use full path: `libragen query --library /path/to/my-lib.libragen "query"`
4. Check `LIBRAGEN_HOME` environment variable

## MCP Issues

### MCP server not loading

**Cause:** Configuration syntax error or server not installed.

**Solutions:**
1. Verify JSON syntax in config file
2. Reinstall: `npx -y install-mcp @libragen/mcp`
3. Check `npx` is in your PATH
4. Restart your AI tool completely (not just the chat)

### npx cache corruption (ENOTEMPTY error)

**Cause:** The npx cache can become corrupted, especially with native modules like `better-sqlite3`. You may see errors like:
```
ENOTEMPTY: directory not empty, rename '.../node_modules/better-sqlite3'
```

**Solutions:**
1. Clear the corrupted npx cache:
```bash
rm -rf ~/.npm/_npx
```
2. Restart your AI tool

**Prevention:** For more reliable operation, install globally instead of using npx:
```bash
npm install -g @libragen/mcp
```
Then update your MCP config to use the global install:
```json
{
  "mcpServers": {
    "libragen": {
      "command": "libragen-mcp"
    }
  }
}
```

### "No libraries found" in MCP

**Cause:** Libraries not in the default directory.

**Solutions:**
1. Check library location: `libragen config`
2. Install libraries to default location: `libragen install my-lib.libragen`
3. Set custom path in MCP config:
```json
{
  "mcpServers": {
    "libragen": {
      "command": "npx",
      "args": ["-y", "@libragen/mcp"],
      "env": {
        "LIBRAGEN_HOME": "/path/to/your/libragen"
      }
    }
  }
}
```

### MCP queries are slow

**Cause:** First query downloads the embedding model.

**Solution:** First query takes 10-30 seconds to download the model. Subsequent queries should be fast (<1 second).

### AI tool not using libragen

**Cause:** Tool not configured to use MCP, or server not registered.

**Solutions:**
1. Verify MCP is enabled in your AI tool's settings
2. Check server appears in tool's MCP server list
3. Explicitly ask the AI to "search my libragen libraries for..."
4. Restart the AI tool after config changes

## Library Management

### "Library already installed"

**Cause:** A library with the same name already exists.

**Solution:** Use `--force` to overwrite:
```bash
libragen install my-lib.libragen --force
```

### Can't uninstall library

**Cause:** Library is referenced by a collection, or file doesn't exist.

**Solutions:**
1. Uninstall the collection first: `libragen collection uninstall <collection>`
2. Manually delete the file from the library directory
3. Check library location: `libragen config`

### Library file is corrupted

**Cause:** Incomplete download or disk error.

**Solutions:**
1. Delete and rebuild: `rm my-lib.libragen && libragen build ...`
2. Re-download from collection: `libragen install my-lib --force`
3. Verify file integrity with `libragen inspect my-lib.libragen`

## Platform-Specific Issues

### macOS: "operation not permitted"

**Cause:** macOS security restrictions.

**Solutions:**
1. Grant Terminal full disk access in System Preferences → Privacy & Security
2. Run from a different directory (outside ~/Desktop, ~/Documents)

### Windows: Path too long

**Cause:** Windows path length limits.

**Solutions:**
1. Enable long paths in Windows (requires admin)
2. Use shorter directory names
3. Move project closer to drive root

### Linux: Missing dependencies

**Cause:** System libraries required for native modules.

**Solution:**
```bash
# Debian/Ubuntu
sudo apt-get install build-essential python3

# RHEL/CentOS
sudo yum groupinstall "Development Tools"
```

## Getting Help

If you're still stuck:

1. **Check version:** `libragen --cli-version` (ensure you're on the latest)
2. **View config:** `libragen config` (verify paths are correct)
3. **Verbose output:** Add `--verbose` to commands for more details
4. **GitHub Issues:** [Report a bug](https://github.com/libragen/libragen/issues)
