---
"@agentrail/capabilities": minor
---

Add toolCalls field to sub-agent job results

ManagedAgentDeliveryResult and OrchestrationAgentJob now carry a toolCalls array with every tool call the sub-agent made during a job, including the tool name, input arguments, and the full output (content and structured details). The wait_agent tool result now includes the resolution object so the parent LLM can see outputText and toolCalls.
