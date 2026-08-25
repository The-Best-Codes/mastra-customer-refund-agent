import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  FileSearch,
  Inbox,
  MailWarning,
  PackageSearch,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';

const FLOW_STEPS = [
  { icon: Inbox, title: 'Ingest', description: 'A customer email arrives, gets normalized into a SupportCase, and is deduplicated by external id.' },
  { icon: Sparkles, title: 'Classify', description: 'The triage agent labels intent, urgency, sentiment, and confidence with structured output.' },
  { icon: BookOpenCheck, title: 'Retrieve policy', description: 'A RAG search over the refund/shipping/subscription/escalation knowledge base grounds the response.' },
  { icon: PackageSearch, title: 'Inspect order', description: 'Read-only tools look up the order, subscription, and prior refund history.' },
  { icon: FileSearch, title: 'Draft response', description: 'The response agent drafts a grounded reply and recommends a refund and/or escalation.' },
  { icon: UserCheck, title: 'Human approval', description: 'If a refund is recommended, the workflow suspends and waits for a human to approve or reject it.' },
  { icon: ShieldCheck, title: 'Execute or escalate', description: 'An approved refund is issued (idempotently, capped, audited). A rejected or risky case is escalated instead.' },
];

const PRIMITIVES = [
  { title: 'Supervisor + specialist agents', description: '`supportSupervisorAgent` delegates to `triageAgent` and `responseAgent`.' },
  { title: 'RAG', description: 'Policy docs are chunked, embedded, and queried with `createVectorQueryTool`.' },
  { title: 'Conversation memory', description: 'Every case is a Mastra thread, so the full back-and-forth is recalled automatically.' },
  { title: 'Tools', description: 'Read-only order/subscription/policy lookups, plus one gated transactional tool.' },
  { title: 'Human-in-the-loop approval', description: 'The resolution workflow suspends with `suspend()` and resumes on human approval.' },
  { title: 'Structured output', description: 'Triage and drafting both return schema-validated objects, not prose to parse.' },
];

export function Landing() {
  return (
    <div className="space-y-10">
      <section className="space-y-4 text-center">
        <p className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
          <MailWarning className="size-3.5" /> Mastra template
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-balance">
          A customer support agent that can offer refunds — without going rogue
        </h1>
        <p className="mx-auto max-w-2xl text-muted-foreground text-balance">
          This template resolves real support cases end to end: it classifies intent, grounds its replies in a
          policy knowledge base, inspects orders, and drafts a response — but it never touches money without a
          human clicking "approve" first.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Button size="lg" render={<Link to="/portal" />}>
            Try it as a customer <ArrowRight className="size-4" />
          </Button>
          <Button size="lg" variant="outline" render={<Link to="/admin" />}>
            Open the support admin
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">How a case moves through the system</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW_STEPS.map((step, i) => (
            <Card key={step.title} className="relative">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <step.icon className="size-4" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Step {i + 1}</span>
                </div>
                <CardTitle className="text-base">{step.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{step.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Mastra primitives in play</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PRIMITIVES.map(p => (
            <Card key={p.title}>
              <CardHeader className="pb-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <CardTitle className="text-sm">{p.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{p.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-background p-6">
        <h2 className="mb-2 text-lg font-semibold">Want to see the agents and workflow directly?</h2>
        <p className="text-sm text-muted-foreground">
          Run <code className="rounded bg-muted px-1.5 py-0.5">bun run dev</code> in the project root and open{' '}
          <a className="font-medium text-primary underline" href="http://localhost:4111" target="_blank" rel="noreferrer">
            Mastra Studio
          </a>{' '}
          to chat with <code className="rounded bg-muted px-1.5 py-0.5">supportSupervisorAgent</code> directly, or
          watch <code className="rounded bg-muted px-1.5 py-0.5">resolveSupportCaseWorkflow</code> suspend and
          resume live in the Workflows tab.
        </p>
      </section>
    </div>
  );
}
