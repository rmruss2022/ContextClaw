# 🦞 ContextClaw

Session and context management for OpenClaw agents. Analyze token usage, prune old sessions, and visualize context consumption.

## Features

- **📊 Session Analysis** - Deep insights into context usage across all sessions
- **🔍 Token Tracking** - Estimate token consumption per session
- **📈 Size Visualization** - See which sessions consume the most storage
- **🧹 Smart Pruning** - Clean up old sessions while protecting active ones
- **🗑️ Orphan Cleanup** - Remove sessions not referenced in sessions.json
- **📉 Context Management** - Keep your context window clean and efficient
- **🎨 Beautiful Dashboard** - Visual interface for session management

## Why ContextClaw?

Over time, OpenClaw sessions accumulate:
- Old sub-agent sessions
- Completed cron job runs
- Test/debug sessions
- Orphaned session files

ContextClaw helps you identify, analyze, and safely clean up these sessions to:
- **Reduce storage usage**
- **Improve session loading performance**
- **Maintain a clean workspace**
- **Monitor context consumption**

## Installation

### From npm (once published)

```bash
npm install -g @rmruss2022/contextclaw
openclaw plugins install @rmruss2022/contextclaw
```

### From GitHub

```bash
npm install -g rmruss2022/ContextClaw
openclaw plugins install @rmruss2022/contextclaw
```

### From Source

```bash
git clone https://github.com/rmruss2022/ContextClaw.git
cd ContextClaw
npm install
npm run build
openclaw plugins install -l .
```

## Setup

Run the interactive setup wizard:

```bash
openclaw contextclaw setup
```

Configuration is saved to `~/.openclaw/context-tracker/config.json`.

## Usage

### Analyze Sessions

Get a comprehensive analysis of all sessions:

```bash
openclaw contextclaw analyze
```

This shows:
- **Summary statistics** - Total sessions, messages, tokens, size
- **Largest sessions** - Top 10 by storage size
- **Oldest sessions** - Sessions by age
- **Orphaned sessions** - Files not in sessions.json

### Prune Old Sessions

Clean up sessions older than N days (default: 30):

```bash
# Dry run (preview what would be deleted)
openclaw contextclaw prune --days 30

# Live run (actually delete files)
openclaw contextclaw prune --days 30 --dryRun false
```

**Safety features:**
- Dry run by default
- Always keeps main agent sessions
- Always keeps cron sessions
- Shows confirmation before deleting

### Clean Orphaned Sessions

Remove session files not referenced in sessions.json:

```bash
# Dry run
openclaw contextclaw clean-orphaned

# Live run
openclaw contextclaw clean-orphaned --dryRun false
```

### Dashboard

Open the visual dashboard:

```bash
openclaw contextclaw dashboard
```

Or visit: **http://localhost:18797**

The dashboard provides:
- **Real-time statistics**
- **Session lists** (all, largest, oldest, orphaned)
- **Size visualization** - Bar charts showing relative sizes
- **Type distribution** - Sessions by agent type
- **Quick actions** - Prune and clean from UI

### Commands

```bash
# Setup
openclaw contextclaw setup        # Interactive setup wizard
openclaw contextclaw status       # Show status and quick stats

# Service management
openclaw contextclaw start        # Start dashboard server
openclaw contextclaw stop         # Stop dashboard server

# Analysis and cleanup
openclaw contextclaw analyze      # Comprehensive session analysis
openclaw contextclaw prune        # Prune old sessions (dry run)
openclaw contextclaw clean-orphaned  # Clean orphaned sessions (dry run)

# Dashboard
openclaw contextclaw dashboard    # Open dashboard in browser
```

## How It Works

### Session Analysis

ContextClaw scans `~/.openclaw/agents/main/sessions/*.jsonl` and:

1. **Parses each session file** - Counts messages, estimates tokens
2. **Reads sessions.json** - Enriches with labels and metadata
3. **Categorizes sessions** - Identifies main, cron, sub-agent, orphaned
4. **Calculates statistics** - Totals, averages, distributions

### Token Estimation

Tokens are estimated using the rule: **1 token ≈ 4 characters**

This is a rough approximation but useful for:
- Comparing relative sizes
- Identifying context-heavy sessions
- Planning context window usage

### Safe Pruning

Prune logic:
- **Age-based**: Only deletes sessions older than threshold
- **Type-aware**: Protects main and cron sessions
- **Dry-run first**: Preview before deleting
- **Confirmation**: Requires explicit approval for live run

### Orphan Detection

A session is orphaned if:
- `.jsonl` file exists in sessions directory
- Session ID is NOT in `sessions.json`

Common causes:
- Sub-agent completed and removed from index
- Manual file operations
- Crashed sessions
- Development/testing

## Configuration

Config file: `~/.openclaw/context-tracker/config.json`

```json
{
  "port": 18797,
  "openclawHome": "/Users/you/.openclaw"
}
```

## Example Output

### Analyze Command

```
📊 Session Analysis

┌──────────────────┬────────┐
│ Metric           │ Value  │
├──────────────────┼────────┤
│ Total Sessions   │ 45     │
│ Total Messages   │ 3,842  │
│ Total Tokens     │ 156,234│
│ Total Size       │ 12.4 MB│
│ Orphaned         │ 8      │
└──────────────────┴────────┘

📈 Largest Sessions (Top 10)
...

⏰ Oldest Sessions (Top 10)
...

⚠️  Orphaned Sessions (8)
Run 'openclaw contextclaw clean-orphaned' to remove them.
```

### Prune Command

```
🧹 Session Pruning

⚠️  DRY RUN MODE - No files will be deleted

Sessions older than 30 days:
  ✓ Would delete: 12
  - Would keep: 33
  - Space freed: 4.2 MB

? Run prune in LIVE mode (actually delete files)? (y/N)
```

## Best Practices

1. **Run analyze regularly** - Weekly or monthly to monitor growth
2. **Start with dry runs** - Always preview before deleting
3. **Adjust age threshold** - Shorter for active development, longer for production
4. **Keep important sessions** - Main and cron are protected by default
5. **Backup before pruning** - While safe, backups are good practice

## Troubleshooting

### Dashboard won't load

Check if server is running:
```bash
openclaw contextclaw status
```

Start it if stopped:
```bash
openclaw contextclaw start
```

### Port already in use

Change port in config:
```bash
openclaw contextclaw setup
# Choose a different port
```

### Token estimates seem off

Token estimation is approximate (1 token ≈ 4 chars). For precise counts, check OpenClaw's own token tracking.

## Development

### Build

```bash
npm install
npm run build    # Compile TypeScript
npm run dev      # Watch mode
```

### Test Locally

```bash
npm run build
openclaw plugins install -l .
openclaw contextclaw analyze
openclaw contextclaw dashboard
```

### Project Structure

```
ContextClaw/
├── src/
│   ├── index.ts                    # Plugin entry + CLI commands
│   ├── server.ts                   # Express API server
│   └── analyzers/
│       └── session-analyzer.ts     # Core analysis logic
├── dashboard/
│   └── public/
│       └── index.html              # Dashboard UI
├── dist/                           # Compiled output
└── package.json
```

## Comparison: Before vs After

| Metric | Before | After Pruning |
|--------|--------|---------------|
| Sessions | 127 | 45 (-82) |
| Storage | 45.2 MB | 12.4 MB (-32.8 MB) |
| Orphaned | 23 | 0 (-23) |
| Oldest | 247 days | 28 days |

## License

MIT

## Contributing

Pull requests welcome! Please ensure:
- TypeScript compiles without errors
- Dashboard works in latest browsers
- CLI commands display properly in terminal

## Credits

Created by Matthew Russell (@rmruss2022)

Built for the OpenClaw community 🦞

## Related Plugins

- **[ActivityClaw](https://github.com/rmruss2022/ActivityClaw)** - Real-time activity tracking
- **[OuraClaw](https://github.com/rickybloomfield/OuraClaw)** - Oura Ring integration
