# Platforma plugin for Claude

Drive the Platforma Desktop App from Claude. The plugin finds the running MCP server itself, so
there is no address to copy and nothing to paste into a config file.

## Install

```
/plugin marketplace add milaboratory/platforma
/plugin install platforma
```

## What it needs

The Platforma Desktop App running, with the MCP server enabled in Settings. Nothing else — no
address, no token, no port.

## How it finds the server

The app publishes its live address to `~/.platforma/mcp-server.json` as the server starts, and
removes the file as the server stops. This plugin reads that file each time Claude starts it, so a
server that rebound to a different port is still found, and a regenerated secret still works.

Nothing else configures the plugin. If the file is absent, or the address it holds answers nothing,
the plugin writes one line to stderr naming the cause and the file it read, and exits. It never
edits or deletes that file — the app owns it.

## The tools

Every tool arrives prefixed with the plugin and server name:

```
mcp__plugin_platforma_pl__<tool>
```

So `ping` reaches Claude as `mcp__plugin_platforma_pl__ping`. Run `/mcp` to see the server and its
tools once the plugin is installed.
