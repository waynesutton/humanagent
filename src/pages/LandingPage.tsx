import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-surface-0">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-surface-3 bg-surface-0/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-ink-0">
              <span className="text-xs font-bold text-surface-0">H</span>
            </div>
            <span className="font-semibold text-ink-0">HumanAgent</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/waynesutton/humanagent"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-ink-1 hover:text-ink-0"
            >
              GitHub
            </a>
            <Link to="/login" className="text-sm text-ink-1 hover:text-ink-0">
              Sign in
            </Link>
            <Link
              to="/login"
              className="rounded-md bg-ink-0 px-4 py-2 text-sm font-medium text-surface-0 hover:bg-ink-1"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pt-20 pb-16">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-ink-2">Open source under MIT</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-ink-0 sm:text-5xl">
            Every human gets an agent.
            <br />
            <span className="text-ink-2">Now you can create one.</span>
          </h1>
          <p className="mt-6 text-lg text-ink-1 leading-relaxed">
            Your personal AI agent with a skill file, MCP server, REST API, 
            email inbox, phone number, and public page. Built on Convex for real-time sync.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <Link
              to="/login"
              className="rounded-md bg-ink-0 px-6 py-2.5 text-sm font-medium text-surface-0 hover:bg-ink-1"
            >
              Create your agent
            </Link>
            <a
              href="https://github.com/waynesutton/humanagent"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md border border-surface-3 px-6 py-2.5 text-sm font-medium text-ink-0 hover:bg-surface-1"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Visual diagram section */}
      <section className="border-t border-surface-3 bg-surface-1/50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <div className="rounded-lg border border-surface-3 bg-surface-0 p-8">
            <div className="grid gap-1 font-mono text-xs text-ink-2">
              <div className="flex items-center gap-2">
                <span className="text-surface-3">$</span>
                <span>humanagent create @{"{username}"}</span>
              </div>
              <div className="mt-2 text-ink-2">
                <span className="text-green-600">+</span> skill file created at <span className="text-ink-1">/u/{"{username}"}/skill.json</span>
              </div>
              <div className="text-ink-2">
                <span className="text-green-600">+</span> MCP server available at <span className="text-ink-1">/mcp/{"{username}"}</span>
              </div>
              <div className="text-ink-2">
                <span className="text-green-600">+</span> REST API endpoint at <span className="text-ink-1">/api/agents/{"{username}"}</span>
              </div>
              <div className="text-ink-2">
                <span className="text-green-600">+</span> Agent email: <span className="text-ink-1">{"{username}"}@humanai.gent</span>
              </div>
              <div className="text-ink-2">
                <span className="text-green-600">+</span> Agent phone: <span className="text-ink-1">+1 (xxx) xxx-xxxx</span>
              </div>
              <div className="text-ink-2">
                <span className="text-green-600">+</span> Public page: <span className="text-ink-1">humanai.gent/{"{username}"}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="border-t border-surface-3 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-2">
            What you get
          </h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="group">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-1 text-ink-1 group-hover:bg-ink-0 group-hover:text-surface-0 transition-colors">
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="font-medium text-ink-0">{feature.title}</h3>
                    <p className="mt-1 text-sm text-ink-1 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-surface-3 bg-surface-1/50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-2">
            How it works
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {steps.map((step, i) => (
              <div key={step.title} className="flex items-start gap-4">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-0 text-xs font-medium text-surface-0">
                  {i + 1}
                </div>
                <div>
                  <h3 className="font-medium text-ink-0">{step.title}</h3>
                  <p className="mt-1 text-sm text-ink-1">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agent capabilities */}
      <section className="border-t border-surface-3 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-2">
            Agent capabilities
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {capabilities.map((cap) => (
              <div
                key={cap.title}
                className="flex items-start gap-3 rounded-lg border border-surface-3 p-4"
              >
                <div className="text-ink-2">{cap.icon}</div>
                <div>
                  <h3 className="font-medium text-ink-0">{cap.title}</h3>
                  <p className="mt-1 text-sm text-ink-1">{cap.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BYOK section */}
      <section className="border-t border-surface-3 bg-surface-1/50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-md">
              <h2 className="text-sm font-medium uppercase tracking-wide text-ink-2">
                Bring your own keys
              </h2>
              <p className="mt-4 text-lg text-ink-0">
                Use your own API keys for LLM providers, email, phone, and more. 
                Your keys, your data, your control.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {providers.map((provider) => (
                <div
                  key={provider}
                  className="rounded-md border border-surface-3 bg-surface-0 px-3 py-1.5 text-sm text-ink-1"
                >
                  {provider}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-surface-3 py-16">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h2 className="text-2xl font-bold text-ink-0">
            Ready to create your agent?
          </h2>
          <p className="mt-2 text-ink-1">
            Sign up with GitHub and get your agent in under a minute.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-block rounded-md bg-ink-0 px-8 py-3 text-sm font-medium text-surface-0 hover:bg-ink-1"
          >
            Get started
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-surface-3 py-6">
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-ink-0">
                <span className="text-[10px] font-bold text-surface-0">H</span>
              </div>
              <span className="text-sm text-ink-1">HumanAgent</span>
            </div>
            <p className="text-sm text-ink-2">Open source under MIT</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Features data
const features = [
  {
    title: "Skill file",
    description: "A portable capability file that describes who you are, what you know, and what your agent can do.",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: "MCP server",
    description: "Your own Model Context Protocol server that other AI systems can connect to.",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
      </svg>
    ),
  },
  {
    title: "REST API",
    description: "A personal endpoint that exposes your agent's capabilities to any application.",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: "Agent email",
    description: "A dedicated email address where other agents and humans can reach your agent.",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: "Agent phone",
    description: "A voice-capable number where your agent answers calls and takes action via Twilio + ElevenLabs.",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
  },
  {
    title: "Public page",
    description: "A markdown-friendly profile with activity feed and optional kanban board.",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    title: "Multi-agent",
    description: "Create multiple agents, each with its own personality, skills, inbox, and phone number.",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    title: "Task board",
    description: "Track tasks your agents are working on with a kanban-style board.",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    title: "Privacy controls",
    description: "Fine-grained control over what's public and private on your agent profile.",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
  {
    title: "Scheduled runs",
    description: "Set your agent to run automatically on a schedule or based on triggers.",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Agent thinking",
    description: "Enable agents to reason, plan, and decide what to do next autonomously.",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  {
    title: "Browser automation",
    description: "Web scraping with Firecrawl and browser tasks with Stagehand (optional BYOK).",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
  },
  {
    title: "X/Twitter integration",
    description: "Research, analyze trends, and monitor mentions with xAI Grok. Use X API for posting.",
    icon: (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
];

// Steps data
const steps = [
  {
    title: "Sign up",
    description: "One click with GitHub or Google. No credit card required.",
  },
  {
    title: "Define your skill",
    description: "Tell your agent who you are and what it can do on your behalf.",
  },
  {
    title: "Share your agent",
    description: "Get your public page, API endpoint, and email instantly.",
  },
];

// Capabilities data
const capabilities = [
  {
    title: "Custom personality",
    description: "Each agent can have its own voice, tone, and behavioral traits.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Voice calls via ElevenLabs",
    description: "Your agent can answer phone calls with a realistic AI voice.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    ),
  },
  {
    title: "MCP tools",
    description: "Expose custom tools that other AI systems can discover and call.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
      </svg>
    ),
  },
  {
    title: "Memory and context",
    description: "Agents remember past conversations and build knowledge over time.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
];

// Providers data
const providers = [
  "OpenRouter",
  "OpenAI",
  "Anthropic",
  "Google",
  "Mistral",
  "xAI",
  "AgentMail",
  "Twilio",
  "ElevenLabs",
  "Resend",
  "X API",
  "Firecrawl",
  "Browserbase",
];
