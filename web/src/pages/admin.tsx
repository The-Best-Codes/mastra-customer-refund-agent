import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CaseListItem } from '@/components/admin/case-list-item';
import { CaseDetail } from '@/components/admin/case-detail';
import { approveCase, listCases, listMockEmails, rejectCase, reindexKnowledge, submitCase } from '@/lib/api';
import type { MockEmailPayload, SupportCase } from '@/lib/types';
import { Inbox, Loader2, RefreshCcw, Send } from 'lucide-react';

const APPROVER_STORAGE_KEY = 'support-demo:approver-id';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'In progress' },
  { value: 'waiting_approval', label: 'Waiting approval' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
] as const;

export function Admin() {
  const { caseId } = useParams<{ caseId?: string }>();
  const navigate = useNavigate();

  const [cases, setCases] = useState<SupportCase[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('all');
  const [approverId, setApproverId] = useState(() => localStorage.getItem(APPROVER_STORAGE_KEY) ?? 'demo-support-lead');
  const [mockEmails, setMockEmails] = useState<MockEmailPayload[]>([]);
  const [selectedMock, setSelectedMock] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await listCases();
      setCases(res.cases);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    listMockEmails().then(res => {
      setMockEmails(res.emails);
      setSelectedMock(res.emails[0]?.externalId ?? '');
    });
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    localStorage.setItem(APPROVER_STORAGE_KEY, approverId);
  }, [approverId]);

  const filteredCases = useMemo(() => {
    switch (filter) {
      case 'active':
        return cases.filter(c => c.status === 'new' || c.status === 'processing');
      case 'waiting_approval':
      case 'escalated':
      case 'resolved':
        return cases.filter(c => c.status === filter);
      default:
        return cases;
    }
  }, [cases, filter]);

  const selectedCase = cases.find(c => c.id === caseId);

  async function handleSimulate() {
    const mock = mockEmails.find(m => m.externalId === selectedMock);
    if (!mock) return;
    setSending(true);
    try {
      const result = await submitCase({ ...mock, externalId: `${mock.externalId}-${Date.now()}` });
      toast.success(`Case ${result.caseId} created`);
      await refresh();
      navigate(`/admin/${result.caseId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create case');
    } finally {
      setSending(false);
    }
  }

  async function handleReindex() {
    setReindexing(true);
    try {
      const result = await reindexKnowledge();
      toast.success(`Indexed ${result.indexed} policy chunks`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reindex failed');
    } finally {
      setReindexing(false);
    }
  }

  async function handleDecision(approved: boolean, note?: string) {
    if (!selectedCase) return;
    try {
      const updated = approved
        ? await approveCase(selectedCase.id, approverId, note)
        : await rejectCase(selectedCase.id, approverId, note);
      setCases(prev => prev.map(c => (c.id === updated.id ? updated : c)));
      toast.success(approved ? 'Refund approved' : 'Refund rejected — case escalated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit decision');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Support admin</h1>
          <p className="text-sm text-muted-foreground">Review AI-drafted resolutions and approve or reject refunds.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="approver" className="text-xs text-muted-foreground">
              Acting as
            </Label>
            <Input
              id="approver"
              className="h-8 w-40"
              value={approverId}
              onChange={e => setApproverId(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleReindex} disabled={reindexing} className="gap-1.5">
            {reindexing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCcw className="size-3.5" />}
            Reindex knowledge
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2">
        <Inbox className="size-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Simulate an inbound email:</span>
        <Select value={selectedMock} onValueChange={value => setSelectedMock(value ?? '')}>
          <SelectTrigger className="h-8 w-64">
            <SelectValue placeholder="Choose an example" />
          </SelectTrigger>
          <SelectContent>
            {mockEmails.map(mock => (
              <SelectItem key={mock.externalId} value={mock.externalId}>
                {mock.subject}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={handleSimulate} disabled={sending || !selectedMock} className="gap-1.5">
          {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          Send
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="space-y-3">
          <Tabs value={filter} onValueChange={v => setFilter(v as typeof filter)}>
            <TabsList className="flex-wrap h-auto">
              {FILTERS.map(f => (
                <TabsTrigger key={f.value} value={f.value} className="text-xs">
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <ScrollArea className="h-[70vh] rounded-md border bg-background p-2">
            <div className="space-y-2">
              {loading && <p className="p-2 text-sm text-muted-foreground">Loading cases...</p>}
              {!loading && filteredCases.length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">No cases in this view yet.</p>
              )}
              {filteredCases.map(c => (
                <CaseListItem key={c.id} supportCase={c} selected={c.id === caseId} onSelect={() => navigate(`/admin/${c.id}`)} />
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="rounded-md border bg-background p-5">
          {selectedCase ? (
            <CaseDetail supportCase={selectedCase} approverId={approverId} onDecision={handleDecision} />
          ) : (
            <div className="flex h-full min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
              Select a case from the list to see what the AI found and did.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
