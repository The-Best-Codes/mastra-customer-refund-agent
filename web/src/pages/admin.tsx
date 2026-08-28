import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CaseDetail } from "@/components/admin/case-detail";
import { MonitoringSection } from "@/components/admin/monitoring-section";
import { StatusBadge } from "@/components/status-badge";
import {
  approveCase,
  listCases,
  rejectCase,
  reindexKnowledge,
} from "@/lib/api";
import type { SupportCase } from "@/lib/types";
import { RefreshCcw } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

const APPROVER_STORAGE_KEY = "support-demo:approver-id";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "In progress" },
  { value: "waiting_approval", label: "Waiting approval" },
  { value: "escalated", label: "Escalated" },
  { value: "resolved", label: "Resolved" },
] as const;

export function Admin() {
  const { caseId } = useParams<{ caseId?: string }>();
  const navigate = useNavigate();

  const [cases, setCases] = useState<SupportCase[]>([]);
  const [filter, setFilter] =
    useState<(typeof FILTERS)[number]["value"]>("all");
  const [approverId, setApproverId] = useState(
    () => localStorage.getItem(APPROVER_STORAGE_KEY) ?? "demo-support-lead",
  );
  const [reindexing, setReindexing] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await listCases();
      setCases(res.cases);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load cases",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
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
      case "active":
        return cases.filter(
          (c) => c.status === "new" || c.status === "processing",
        );
      case "waiting_approval":
      case "escalated":
      case "resolved":
        return cases.filter((c) => c.status === filter);
      default:
        return cases;
    }
  }, [cases, filter]);

  const selectedCase = cases.find((c) => c.id === caseId);

  async function handleReindex() {
    setReindexing(true);
    try {
      const result = await reindexKnowledge();
      toast.success(`Indexed ${result.indexed} policy chunks`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reindex failed");
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
      setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      toast.success(
        approved ? "Refund approved" : "Refund rejected and case escalated",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to submit decision",
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Support admin
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            This is what your support team would see: review cases, inspect how
            the AI investigated each one, and approve or reject the refunds it
            recommends. Cases it can't resolve on its own show up here waiting
            for a decision.
          </p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Admin controls</CardTitle>
            <CardDescription>Choose the approver.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="approver">Acting approver</FieldLabel>
                <Input
                  id="approver"
                  value={approverId}
                  onChange={(e) => setApproverId(e.target.value)}
                />
                <FieldDescription>
                  This identifier is saved with approval and rejection
                  decisions.
                </FieldDescription>
              </Field>
            </FieldGroup>
            <Separator />
            <Button
              variant="outline"
              onClick={handleReindex}
              disabled={reindexing}
            >
              {reindexing ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCcw data-icon="inline-start" />
              )}
              Reindex knowledge
            </Button>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <CardTitle>Case queue</CardTitle>
                <CardDescription>
                  Filter the list and open a case.
                </CardDescription>
              </div>
              <Tabs
                value={filter}
                onValueChange={(v) => setFilter(v as typeof filter)}
              >
                <TabsList className="h-auto flex-wrap">
                  {FILTERS.map((f) => (
                    <TabsTrigger
                      key={f.value}
                      value={f.value}
                      className="text-xs"
                    >
                      {f.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              {loading && (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              )}
              {!loading && filteredCases.length === 0 && (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyTitle>No cases in this view</EmptyTitle>
                    <EmptyDescription>Try another filter.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {!loading && filteredCases.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Case</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCases.map((c) => (
                      <TableRow
                        key={c.id}
                        data-state={c.id === caseId ? "selected" : undefined}
                      >
                        <TableCell>
                          <button
                            type="button"
                            className="flex flex-col text-left"
                            onClick={() => navigate(`/admin/${c.id}`)}
                          >
                            <span className="font-medium">{c.subject}</span>
                            <span className="text-xs text-muted-foreground">
                              {c.id}
                            </span>
                          </button>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={c.status} />
                        </TableCell>
                        <TableCell>
                          {c.customer.name ?? c.customer.email}
                        </TableCell>
                        <TableCell>
                          {new Date(c.updatedAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Case detail</CardTitle>
              <CardDescription>Review the selected case.</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedCase ? (
                <CaseDetail
                  supportCase={selectedCase}
                  approverId={approverId}
                  onDecision={handleDecision}
                />
              ) : (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyTitle>Select a case</EmptyTitle>
                    <EmptyDescription>
                      Choose a case from the queue to see the conversation,
                      draft, and approval controls.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator />

      <MonitoringSection />
    </div>
  );
}
