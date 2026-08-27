import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/status-badge';
import { CaseFeedback } from '@/components/portal/case-feedback';
import { isCaseActive, listCases, listMockEmails, submitCase } from '@/lib/api';
import type { MockEmailPayload, SupportCase } from '@/lib/types';
import { ArrowRight, Send } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

const STORAGE_KEY = 'support-demo:customer-email';

function CaseCard({
  supportCase,
  onCaseUpdated,
}: {
  supportCase: SupportCase;
  onCaseUpdated: (updated: SupportCase) => void;
}) {
  const lastAgentMessage = [...supportCase.messages].reverse().find(m => m.author === 'agent');
  const isClosed = supportCase.status === 'resolved' || supportCase.status === 'escalated';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{supportCase.subject}</CardTitle>
            <CardDescription>
              Opened {new Date(supportCase.createdAt).toLocaleString()} · Case {supportCase.id}
            </CardDescription>
          </div>
          <StatusBadge status={supportCase.status} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {supportCase.messages.map(message => (
          <div key={message.id} className={message.author === 'customer' ? 'text-foreground' : 'text-muted-foreground'}>
            <span className="font-medium">{message.author === 'customer' ? 'You' : 'Support'}: </span>
            {message.body}
          </div>
        ))}
        {isCaseActive(supportCase.status) && !lastAgentMessage && (
          <p className="text-muted-foreground">The case is still being processed.</p>
        )}
        {supportCase.status === 'waiting_approval' && (
          <p className="text-muted-foreground">A refund was recommended and is waiting for approval.</p>
        )}
        {supportCase.refundResult?.status === 'executed' && (
          <p className="text-muted-foreground">
            Refund of {supportCase.refundResult.amount} {supportCase.refundResult.currency} issued.
          </p>
        )}
        {isClosed && <CaseFeedback supportCase={supportCase} onSubmitted={onCaseUpdated} />}
      </CardContent>
    </Card>
  );
}

export function Portal() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mockEmails, setMockEmails] = useState<MockEmailPayload[]>([]);
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [lookupEmail, setLookupEmail] = useState('');
  const [loadingCases, setLoadingCases] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setEmail(saved);
      setLookupEmail(saved);
    }
    listMockEmails()
      .then(res => setMockEmails(res.emails))
      .catch(() => {});
  }, []);

  const refreshCases = useCallback(async (forEmail: string) => {
    if (!forEmail) {
      setCases([]);
      return;
    }
    setLoadingCases(true);
    try {
      const res = await listCases(forEmail);
      setCases(res.cases);
    } catch {
      // Keep showing the last known list on transient errors.
    } finally {
      setLoadingCases(false);
    }
  }, []);

  useEffect(() => {
    refreshCases(lookupEmail);
  }, [lookupEmail, refreshCases]);

  // Poll while any of the customer's cases are still moving through the pipeline.
  useEffect(() => {
    if (!lookupEmail || !cases.some(c => isCaseActive(c.status))) return;
    const interval = setInterval(() => refreshCases(lookupEmail), 4000);
    return () => clearInterval(interval);
  }, [lookupEmail, cases, refreshCases]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !subject || !body) return;
    setSubmitting(true);
    try {
      const result = await submitCase({
        externalId: `web-${crypto.randomUUID()}`,
        from: email,
        fromName: name || undefined,
        subject,
        body,
      });
      localStorage.setItem(STORAGE_KEY, email);
      setLookupEmail(email);
      setSubject('');
      setBody('');
      toast.success(`Case ${result.caseId} submitted`, { description: 'Our agent is on it - check the list below.' });
      await refreshCases(email);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit case');
    } finally {
      setSubmitting(false);
    }
  }

  async function sendMockEmail(mock: MockEmailPayload) {
    setSubmitting(true);
    try {
      const result = await submitCase({ ...mock, externalId: `${mock.externalId}-${crypto.randomUUID()}` });
      localStorage.setItem(STORAGE_KEY, mock.from);
      setEmail(mock.from);
      setLookupEmail(mock.from);
      toast.success(`Case ${result.caseId} submitted as ${mock.fromName ?? mock.from}`);
      await refreshCases(mock.from);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit case');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Customer portal</h1>
          <p className="max-w-2xl text-muted-foreground">
            Send a support request and track cases by email.
          </p>
        </div>
        <Link to="/admin" className={buttonVariants({ variant: 'outline' })}>
          Open support admin
          <ArrowRight data-icon="inline-end" />
        </Link>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact support</CardTitle>
              <CardDescription>Send a message to create a case.</CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent>
                <FieldGroup>
                  <FieldGroup className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="name">Your name</FieldLabel>
                      <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Alex Kim" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="email">Email</FieldLabel>
                      <Input
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="alex@example.com"
                      />
                      <FieldDescription>We use this to find your cases after you submit.</FieldDescription>
                    </Field>
                  </FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="subject">Subject</FieldLabel>
                    <Input id="subject" required value={subject} onChange={e => setSubject(e.target.value)} placeholder="I was charged twice" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="body">Message</FieldLabel>
                    <Textarea id="body" required rows={5} value={body} onChange={e => setBody(e.target.value)} placeholder="Tell us what happened" />
                  </Field>
                </FieldGroup>
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
                  Send message
                </Button>
              </CardFooter>
            </form>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Or try a sample email</CardTitle>
              <CardDescription>Use a prepared example instead.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {mockEmails.map(mock => (
                <div key={mock.externalId} className="flex flex-col gap-3 rounded-lg border p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{mock.subject}</p>
                    <p className="text-muted-foreground">{mock.fromName ?? mock.from}</p>
                  </div>
                  <Button size="sm" variant="outline" disabled={submitting} onClick={() => sendMockEmail(mock)}>
                    Send
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Your cases</CardTitle>
              <CardDescription>Enter an email address to look up submitted cases.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="lookup">Case lookup email</FieldLabel>
                  <Input
                    id="lookup"
                    type="email"
                    value={lookupEmail}
                    onChange={e => setLookupEmail(e.target.value)}
                    placeholder="alex@example.com"
                  />
                </Field>
              </FieldGroup>
              <Separator />
              {loadingCases && cases.length === 0 && (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              )}
              {!loadingCases && !lookupEmail && (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyTitle>Look up your support history</EmptyTitle>
                    <EmptyDescription>Enter the same email you used for your support request to load your cases.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {!loadingCases && lookupEmail && cases.length === 0 && (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyTitle>No cases found</EmptyTitle>
                    <EmptyDescription>No cases were found for {lookupEmail} yet.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              <div className="flex flex-col gap-3">
                {cases.map(c => (
                  <CaseCard
                    key={c.id}
                    supportCase={c}
                    onCaseUpdated={updated => setCases(prev => prev.map(existing => (existing.id === updated.id ? updated : existing)))}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
