# with-custom-skills

Demonstrates how to create and register custom skills using `SkillManager` from `@agentrail/capabilities`.

Skills are reusable task templates defined as Markdown files. The agent can invoke them via a `Skill` tool that is generated at startup from the files on disk.

## Skill file layout

Skills live under `{DATA_DIR}/skills/<skill-name>/SKILL.md`:

```
data/
└── skills/
    └── summarize-text/
        └── SKILL.md   ← YAML frontmatter + task instructions
```

Each `SKILL.md` must have YAML frontmatter with at least `name` and `description`. The directory name must match the `name` field:

```markdown
---
name: summarize-text
description: Summarises a piece of text into a concise paragraph.
---

# Summarize Text

...instructions...
```

This example ships with one built-in skill: `summarize-text`.

## Run

```bash
cp .env.example .env  # fill in your API key
pnpm --filter @agentrail/with-custom-skills-example dev
```

On startup the server prints the discovered skills:

```
Loaded 1 skill(s): summarize-text
```

## Try it out

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Please summarise this for me: The quick brown fox jumps over the lazy dog. This sentence is famous for containing every letter of the alphabet.",
    "sessionId": null
  }'
```

## Add your own skill

Create a new subdirectory under `data/skills/` with a `SKILL.md` file and restart the server. No code changes required.

## How it works

```ts
const skillManager = new SkillManager(dataDir);

defineProfile({
  id: "skills-agent",
  agent: { model: "anthropic:claude-3-5-sonnet-20241022", prompt: "..." },
  capabilities: [skills(skillManager, { mode: "inline" })],
});
```

`mode: "inline"` runs the skill inside the main agent turn. The default `"delegate"` mode spawns a sub-agent, which is more powerful but adds complexity not needed for this example.

## Key files

| File                                  | Purpose                               |
| ------------------------------------- | ------------------------------------- |
| `src/main.ts`                         | Entry point — lists skills on startup |
| `src/agent.ts`                        | Profile with `skills()` capability    |
| `data/skills/summarize-text/SKILL.md` | Example skill definition              |
