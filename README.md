# claude-mods

Mods for Claude Code: small plugins that change how Claude looks or behaves.

## Mods

| Mod | What it does |
| --- | --- |
| `brain-dump` | `/dump` turns a rambling voice-to-text brain dump into a clean, structured prompt you can review before sending. |
| `task-progress` | A card above the prompt with a progress bar for Claude's task list, one bar per agent. Subagents with no task list show a moving activity bar. **All steps** expands the full list. |

## Install

Type these at a Claude Code prompt, one at a time. Answer `y` to add the marketplace, then pick a scope.

```
/plugin install brain-dump --marketplace summerzahara/claude-mods
```

```
/plugin install task-progress --marketplace summerzahara/claude-mods
```

## Adding a mod

Put the mod in its own folder at the top of this repository and add it to `plugins` in `.claude-plugin/marketplace.json`.
