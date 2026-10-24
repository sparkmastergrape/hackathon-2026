// Mastercard Developers MCP server.
// Exposes the Mastercard Developers documentation + OpenAPI tools over stdio
// so any MCP client (Claude Code, Cursor, VS Code) can query them.
//
// Run: node server.mjs
//
// Optional scoping (see https://developer.mastercard.com/platform/documentation/agent-toolkit/install-mcp-sdk/):
//   service:          URL of a single Mastercard service's documentation
//   apiSpecification: raw OpenAPI/Swagger spec URL (overrides `service`)
// Setting either one disables the get-services-list tool.

import { MastercardDevelopersAgentToolkit } from '@mastercard/developers-agent-toolkit/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const toolkit = new MastercardDevelopersAgentToolkit({});

async function main() {
  await toolkit.connect(new StdioServerTransport());
  console.error('Mastercard Developers MCP Server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error in main():', err);
  process.exit(1);
});
