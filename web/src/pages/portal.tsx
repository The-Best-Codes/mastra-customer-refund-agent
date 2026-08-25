import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/status-badge';
import { isCaseActive, listCases, listMockEmails, submitCase } from '@/lib/api';
import type { MockEmailPayload, SupportCase } from '@/lib/types';
import { Loader2, Mail, Send } from 'lucide-react';

const STORAGE_KEY = 'support-demo:customer-email';

function CaseCard({ supportCase }: { supportCase: SupportCase }) {
  const lastAgentMessage = [...supportCase.messages].reverse().find(m => m.author === 'agent');
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
      <CardContent className="space-y-3 text-sm">
        {supportCase.messages.map(message => (
          <div key={message.id} className={message.author === 'customer' ? 'text-foreground' : 'text-muted-foreground'}>
            <span className="font-medium">{message.author === 'customer' ? 'You' : 'Support'}: </span>
            {message.body}
          </div>
        ))}
        {isCaseActive(supportCase.status) && !lastAgentMessage && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Our AI agent is looking into this...
          </div>
        )}
        {supportCase.status === 'waiting_approval' && (
          <p className="rounded-md bg-purple-50 px-3 py-2 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
            A refund has been recommended and is waiting on a support lead's approval.
          </p>
        )}
        {supportCase.refundResult?.status === 'executed' && (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Refund of {supportCase.refundResult.amount} {supportCase.refundResult.currency} issued.
          </p>
        )}
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
      const result = await submitCase({ ...mock, externalId: `${mock.externalId}-${Date.now()}` });
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
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Contact support</CardTitle>
            <CardDescription>Send a message the way a real customer would — this becomes a support case.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Your name</Label>
                  <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Alex Kim" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="alex@example.com"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" required value={subject} onChange={e => setSubject(e.target.value)} placeholder="I was charged twice" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="body">Message</Label>
                <Textarea id="body" required rows={5} value={body} onChange={e => setBody(e.target.value)} placeholder="Tell us what happened..." />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={submitting} className="gap-2">
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Send message
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Or try a canned example</CardTitle>
            <CardDescription>One click sends it as that customer, so you can see how different cases resolve.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {mockEmails.map(mock => (
              <div key={mock.externalId} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
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

      <div className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="lookup">Your cases</Label>
            <Input
              id="lookup"
              type="email"
              value={lookupEmail}
              onChange={e => setLookupEmail(e.target.value)}
              placeholder="Enter your email to see your cases"
            />
          </div>
          <Mail className="mb-2 size-4 text-muted-foreground" />
        </div>
        <Separator />
        {loadingCases && cases.length === 0 && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {!loadingCases && lookupEmail && cases.length === 0 && (
          <p className="text-sm text-muted-foreground">No cases found for {lookupEmail} yet.</p>
        )}
        <div className="space-y-3">
          {cases.map(c => (
            <CaseCard key={c.id} supportCase={c} />
          ))}
        </div>
      </div>
    </div>
  );
}
