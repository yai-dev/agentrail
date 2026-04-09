---
title: Roadmap
layout: page
---

<script setup>
import { ref, onMounted } from 'vue'
onMounted(() => {
  const obs = new IntersectionObserver(
    (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('rm-visible'); obs.unobserve(e.target) } }),
    { threshold: 0.1 }
  )
  document.querySelectorAll('.rm-fade').forEach(el => obs.observe(el))
})
</script>

<div class="rm-page">

<div class="rm-hero">
  <p class="rm-label">Roadmap</p>
  <h1 class="rm-title">What's coming next.</h1>
  <p class="rm-sub">
    Agentrail is pre-GA. APIs may change. This page is a living document —
    priorities shift based on community feedback and contributor availability.
  </p>
  <div class="rm-stage-banner">
    <span class="rm-stage-badge">Pre-GA</span>
    <span class="rm-stage-desc">Breaking changes expected · Targeting a stable 1.0 release</span>
  </div>
</div>

<div class="rm-timeline">

<div class="rm-phase rm-phase-near rm-fade">
  <p class="rm-phase-tag">Near-Term</p>
  <h2 class="rm-phase-title">GA Readiness</h2>
  <p class="rm-phase-sub">
    These items must be addressed before a 1.0 stable release.
    Breaking changes are expected until this phase is complete.
  </p>

  <div class="rm-group">
    <p class="rm-group-title">Core Stability</p>
    <div class="rm-items">
      <div class="rm-item"><span class="rm-icon rm-icon-todo">○</span><span>Finalize public API surface for <code>@agentrail/core</code>, <code>@agentrail/app</code>, and orchestration capabilities</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-todo">○</span><span>Lock the <code>AgentrailPlugin</code> contract</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-todo">○</span><span>Lock the <code>AgentrailSessionStore</code> interface</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-todo">○</span><span>Lock the <code>AgentrailProfile</code> / <code>ProfileDefinition</code> contracts</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-todo">○</span><span>Stabilize the event type taxonomy (<code>RuntimeEvent</code>, <code>AgentrailHostEvent</code>)</span></div>
    </div>
  </div>

  <div class="rm-group">
    <p class="rm-group-title">Developer Experience</p>
    <div class="rm-items">
      <div class="rm-item"><span class="rm-icon rm-icon-todo">○</span><span>Publish <code>@agentrail/testing</code> with official mock utilities (<code>MockLlmClient</code>, <code>MockRuntimeTool</code>)</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-todo">○</span><span>Improve <code>create-agentrail-app</code> templates with real LLM setup out of the box</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-todo">○</span><span>End-to-end integration test suite for the host layer</span></div>
    </div>
  </div>

  <div class="rm-group">
    <p class="rm-group-title">Documentation</p>
    <div class="rm-items">
      <div class="rm-item"><span class="rm-icon rm-icon-todo">○</span><span>Complete all concept, guide, and reference documentation</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-todo">○</span><span>Add API reference docs generated from source</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-done">✓</span><span>Launch a documentation site</span></div>
    </div>
  </div>
</div>

<div class="rm-phase rm-phase-mid rm-fade">
  <p class="rm-phase-tag">Mid-Term</p>
  <h2 class="rm-phase-title">Post-GA Improvements</h2>
  <p class="rm-phase-sub">
    Planned directions after the core is stable. Sequencing will be driven by community
    usage patterns and contributor availability.
  </p>

  <div class="rm-group">
    <p class="rm-group-title">Storage Abstraction</p>
    <div class="rm-items">
      <div class="rm-item"><span class="rm-icon rm-icon-plan">·</span><span>Define a storage-agnostic <code>SessionStore</code> interface (remove filesystem path leakage)</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-plan">·</span><span>Define a storage-agnostic <code>OrchestrationStore</code> interface</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-plan">·</span><span>Provide reference implementations for PostgreSQL and SQLite</span></div>
    </div>
  </div>

  <div class="rm-group">
    <p class="rm-group-title">Scalability</p>
    <div class="rm-items">
      <div class="rm-item"><span class="rm-icon rm-icon-plan">·</span><span>Support multiple concurrent orchestration runs per manager</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-plan">·</span><span>Reduce in-memory state coupling in <code>OrchestrationManager</code></span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-plan">·</span><span>Investigate distributed orchestration (multi-process / multi-node)</span></div>
    </div>
  </div>

  <div class="rm-group">
    <p class="rm-group-title">LLM Provider System</p>
    <div class="rm-items">
      <div class="rm-item"><span class="rm-icon rm-icon-plan">·</span><span>Replace global singleton <code>LlmProviderRegistry</code> with instance-scoped registries</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-plan">·</span><span>Support per-agent and per-tenant provider configuration</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-plan">·</span><span>Add provider-level retry and fallback policies</span></div>
    </div>
  </div>

  <div class="rm-group">
    <p class="rm-group-title">Plugin System</p>
    <div class="rm-items">
      <div class="rm-item"><span class="rm-icon rm-icon-plan">·</span><span>Add plugin priority ordering</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-plan">·</span><span>Add error isolation — one plugin failure does not block others</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-plan">·</span><span>Middleware-style request interceptor chain (replace first-match-wins)</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-plan">·</span><span>Shared context bag for inter-plugin communication</span></div>
    </div>
  </div>

  <div class="rm-group">
    <p class="rm-group-title">Sub-Agent Communication</p>
    <div class="rm-items">
      <div class="rm-item"><span class="rm-icon rm-icon-plan">·</span><span>Structured output types for sub-agent results (beyond <code>outputText: string</code>)</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-plan">·</span><span>Typed agent-to-agent message contracts</span></div>
    </div>
  </div>

  <div class="rm-group">
    <p class="rm-group-title">Observability</p>
    <div class="rm-items">
      <div class="rm-item"><span class="rm-icon rm-icon-plan">·</span><span>OpenTelemetry trace integration in the agent loop and tool executor</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-plan">·</span><span>Structured logging with configurable log levels</span></div>
      <div class="rm-item"><span class="rm-icon rm-icon-plan">·</span><span>Built-in metrics: request count, token usage, tool execution latency</span></div>
    </div>
  </div>
</div>

<div class="rm-phase rm-phase-no rm-fade">
  <p class="rm-phase-tag">Not Planned</p>
  <h2 class="rm-phase-title">Out of Scope</h2>
  <p class="rm-phase-sub">
    To set clear expectations, these are intentionally excluded.
    Agentrail is a code-first, self-hosted framework.
  </p>

  <div class="rm-items">
    <div class="rm-item"><span class="rm-icon rm-icon-no">✕</span><span>Hosted cloud platform or SaaS offering</span></div>
    <div class="rm-item"><span class="rm-icon rm-icon-no">✕</span><span>Built-in billing or usage metering</span></div>
    <div class="rm-item"><span class="rm-icon rm-icon-no">✕</span><span>Proprietary model integrations beyond the open provider API</span></div>
    <div class="rm-item"><span class="rm-icon rm-icon-no">✕</span><span>GUI-based agent builder — Agentrail is code-first by design</span></div>
  </div>
</div>

</div>

<div class="rm-cta rm-fade">
  <p class="rm-cta-label">Want to influence priorities?</p>
  <h3 class="rm-cta-title">Contribute to the roadmap.</h3>
  <p class="rm-cta-desc">
    Open a feature request to discuss an idea, reference this roadmap in your issue for context,
    or submit a PR for any roadmap item. Community feedback directly shapes what gets built next.
  </p>
  <a href="https://github.com/yai-dev/agentrail/issues/new?template=feature_request.md" target="_blank" rel="noopener" class="rm-btn">Open a Feature Request →</a>
</div>

</div>

<style>
.rm-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 40px 80px;
}

.rm-hero {
  padding: 60px 0 60px;
  border-bottom: 1px solid var(--vp-c-border);
  margin-bottom: 0;
}

.rm-label {
  font-family: var(--vp-font-family-mono);
  font-size: 0.7rem;
  letter-spacing: 0.16em;
  color: var(--at-accent);
  text-transform: uppercase;
  margin-bottom: 16px;
}

.rm-title {
  font-family: 'DM Serif Display', Georgia, serif;
  font-size: clamp(2.4rem, 4vw, 3.6rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin-bottom: 20px;
  border: none !important;
  padding: 0 !important;
}

.rm-sub {
  font-size: 1rem;
  color: var(--vp-c-text-2);
  max-width: 560px;
  line-height: 1.7;
  margin-bottom: 28px;
}

.rm-stage-banner {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  background: var(--at-accent-faint);
  border: 1px solid rgba(196, 255, 46, 0.3);
  padding: 10px 20px;
}

.rm-stage-badge {
  font-family: var(--vp-font-family-mono);
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  background: var(--at-accent);
  color: #060606;
  padding: 2px 8px;
  font-weight: 600;
}

.rm-stage-desc {
  font-family: var(--vp-font-family-mono);
  font-size: 0.76rem;
  color: var(--vp-c-text-2);
}

.rm-timeline {
  display: flex;
  flex-direction: column;
}

.rm-phase {
  padding: 48px 0 48px 40px;
  border-left: 2px solid var(--vp-c-border);
  position: relative;
}

.rm-phase::before {
  content: '';
  position: absolute;
  left: -6px;
  top: 52px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--vp-c-border);
}

.rm-phase-near::before { background: var(--at-accent); }
.rm-phase-near { border-left-color: rgba(196, 255, 46, 0.3); }

.rm-phase-mid::before { background: #555550; }

.rm-phase-no::before { background: #333330; }
.rm-phase-no { border-left-color: #1c1c1c; }

.rm-phase-tag {
  font-family: var(--vp-font-family-mono);
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--at-accent);
  margin-bottom: 10px;
}

.rm-phase-mid .rm-phase-tag { color: #888880; }
.rm-phase-no .rm-phase-tag { color: #555550; }

.rm-phase-title {
  font-family: 'DM Serif Display', Georgia, serif;
  font-size: 1.6rem;
  margin-bottom: 12px;
  border: none !important;
  padding: 0 !important;
}

.rm-phase-sub {
  font-size: 0.88rem;
  color: var(--vp-c-text-2);
  line-height: 1.6;
  max-width: 560px;
  margin-bottom: 32px;
}

.rm-group {
  margin-bottom: 28px;
}

.rm-group-title {
  font-family: var(--vp-font-family-mono);
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
  margin-bottom: 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--vp-c-border);
}

.rm-items {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rm-item {
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-size: 0.88rem;
  color: var(--vp-c-text-1);
  line-height: 1.55;
}

.rm-icon {
  font-family: var(--vp-font-family-mono);
  font-size: 0.78rem;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}

.rm-icon-todo { color: var(--at-accent); }
.rm-icon-done { color: var(--at-accent); }
.rm-icon-plan { color: #555550; }
.rm-icon-no { color: #ff5f57; }

.rm-cta {
  margin-top: 60px;
  padding: 40px;
  border: 1px solid rgba(196, 255, 46, 0.2);
  background: rgba(196, 255, 46, 0.02);
}

.rm-cta-label {
  font-family: var(--vp-font-family-mono);
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--at-accent-dim);
  margin-bottom: 12px;
}

.rm-cta-title {
  font-family: 'DM Serif Display', Georgia, serif;
  font-size: 1.4rem;
  margin-bottom: 12px;
  border: none !important;
  padding: 0 !important;
}

.rm-cta-desc {
  font-size: 0.88rem;
  color: var(--vp-c-text-2);
  margin-bottom: 28px;
  line-height: 1.6;
  max-width: 520px;
}

.rm-btn {
  display: inline-block;
  font-family: var(--vp-font-family-mono);
  font-size: 0.82rem;
  letter-spacing: 0.04em;
  padding: 11px 22px;
  background: var(--at-accent);
  color: #060606 !important;
  text-decoration: none !important;
  border-radius: 2px;
  font-weight: 500;
  transition: background 0.2s;
}

.rm-btn:hover { background: #d4ff50; }

/* fade-in animation */
.rm-fade {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}

.rm-fade.rm-visible {
  opacity: 1;
  transform: translateY(0);
}

@media (max-width: 640px) {
  .rm-page { padding: 24px 24px 60px; }
  .rm-hero { padding: 40px 0; }
  .rm-phase { padding-left: 24px; }
}
</style>
