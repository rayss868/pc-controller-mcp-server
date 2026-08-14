# PC Controller MCP Server — ChatGPT Setup Guide

## Current Status

The PC Controller MCP server currently uses **stdio transport**, which is compatible with
Claude Desktop, Cursor, Windsurf, OpenClaude, and other MCP clients that support stdio-based
server communication.

## ChatGPT Compatibility

### ChatGPT Desktop App (MCP Support)

As of 2025, the ChatGPT Desktop app has begun supporting MCP servers. If your version
supports MCP, you can use the same JSON configuration format as Claude Desktop:

```json
{
  "mcpServers": {
    "pc-controller": {
      "command": "node",
      "args": ["D:\\All_project\\own\\AI_Coder\\MCP_Tools\\pc_controller\\dist\\index.js"]
    }
  }
}
```

Place this in the ChatGPT Desktop MCP configuration file (check OpenAI's documentation
for the exact path, as it may vary by version and OS).

### SSE Transport (Future Enhancement)

For full compatibility with ChatGPT's web interface and other HTTP-based MCP clients,
this server would need to support **SSE (Server-Sent Events) transport** in addition to
or instead of stdio. This is planned as a future enhancement.

Once SSE transport is added, you would be able to:

1. Start the server with an HTTP endpoint:
   ```bash
   node dist/index.js --transport sse --port 3000
   ```

2. Connect from ChatGPT or any HTTP-capable MCP client using the server URL:
   ```
   http://localhost:3000/sse
   ```

## What Is SSE Transport?

SSE transport allows MCP servers to communicate over HTTP instead of stdin/stdout. This is
required for:

- ChatGPT web interface integration
- Remote server connections (not just localhost)
- Any client that cannot spawn local processes

## Stay Updated

Watch this project's repository for updates on SSE transport support. Once implemented,
this guide will be updated with detailed ChatGPT setup instructions.
