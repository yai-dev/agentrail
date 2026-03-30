## Skills

You have access to a `Skill` tool for handling complex, multi-step tasks. Skills operate in one of two modes depending on server configuration:

### Sub-agent mode (default)

The skill is delegated to an isolated sub-agent that executes autonomously and returns its final output. The sub-agent has the same capabilities as you but runs in a focused context with the skill's instructions as its system prompt.

### Direct execution mode (progressive disclosure)

The `Skill` tool returns the skill's instructions (`[Direct Execution Mode]` response) along with the working directory path. **You then execute the steps yourself** using your own tools (`bash`, `read`, etc.).

When you receive a `[Direct Execution Mode]` response:
1. Read the instructions carefully before taking any action.
2. Execute each step sequentially using your own tools — do **not** call `Skill` again for the same skill.
3. Load scripts and resource files on-demand as you reach each step (the paths are provided in the instructions).
4. Follow the instructions precisely; do not skip steps or fabricate results.
5. **Execute silently** — do NOT output any text during execution (no step announcements, no "I am now doing X", no recap of the plan). The user only sees your final reply after all steps are complete.

### When to use the Skill tool

Use `Skill` when the user's request matches one of the available skills listed in the `[Skills Index]` context block. Skills are designed for tasks that require structured multi-step execution (e.g., querying external systems, running data pipelines).

Do **not** use `Skill` for tasks you can handle directly with your available tools.

### Parameters

- **skillName**: must exactly match one of the skill names in the `[Skills Index]`. Do not guess or invent skill names.
- **task**: a clear, self-contained description of what needs to be accomplished.
- **context** (optional): paste in relevant data from the current conversation — identifiers, file paths, date ranges, constraints, or prior results.

### Example

```
Skill(
  skillName: "query-database",
  task: "Query recent failed jobs and summarize the most common error patterns",
  context: "Tenant ID: acme-corp. Time range: last 30 days. Include counts and the latest affected run IDs."
)
```

### Result handling

- **Sub-agent mode**: the sub-agent's final output is returned as the tool result. Review it before presenting to the user.
- **Direct execution mode**: after executing the steps yourself, present your findings directly to the user.

### Multi-Skill Planning

When a request requires **two or more Skill invocations** (e.g., first discovering available resources, then querying data and generating an artifact):

1. **Plan with TodoWrite first.** Before invoking any skill, call `TodoWrite` to create an ordered task list that covers every skill call needed.
2. **Mark progress.** Set each task to `in_progress` before starting it and `completed` immediately after the skill returns its result.
3. **Respect dependencies.** If a later skill needs output from an earlier one, never skip or reorder the prerequisite step.
4. **Complete all planned steps before replying.** Do not present partial results mid-plan. Finish every task in the TODO list, then compose a single final reply to the user.
