import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { SupportCase } from "@/lib/types";

export function ApprovalCard({
  supportCase,
  approverId,
  onDecision,
}: {
  supportCase: SupportCase;
  approverId: string;
  onDecision: (approved: boolean, note?: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const draft = supportCase.draft;
  if (!draft) return null;

  async function handle(approved: boolean) {
    setPending(approved ? "approve" : "reject");
    try {
      await onDecision(approved, note || undefined);
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Refund approval requested</CardTitle>
        <CardDescription>
          Reviewing as <span className="font-medium">{approverId}</span>.
          Nothing is charged or refunded until you decide.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Human review is required</AlertTitle>
          <AlertDescription>
            The workflow paused after drafting a refund recommendation. Review
            the amount, customer reply, and note before you continue.
          </AlertDescription>
        </Alert>
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground">Amount</p>
            <p className="font-medium">
              {draft.refundAmount} {draft.refundCurrency}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground">Order</p>
            <p className="font-medium">
              {supportCase.orderLookup?.order?.orderId ?? "Not found"}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground">Reason</p>
            <p className="font-medium">{draft.refundReason}</p>
          </div>
        </div>
        <Separator />
        <div>
          <p className="mb-2 text-sm font-medium">Drafted customer reply</p>
          <p className="rounded-md border bg-background p-3 text-sm whitespace-pre-wrap">
            {draft.draftResponse}
          </p>
        </div>
        {draft.citedSources.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {draft.citedSources.map((source) => (
              <Badge key={source} variant="outline">
                {source}
              </Badge>
            ))}
          </div>
        )}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="approval-note">Internal note</FieldLabel>
            <Textarea
              id="approval-note"
              placeholder="Optional note that will be saved in the case history"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
            <FieldDescription>
              Use this if you want to explain why you approved or rejected the
              recommendation.
            </FieldDescription>
          </Field>
        </FieldGroup>
        <div className="flex gap-2">
          <Button onClick={() => handle(true)} disabled={pending !== null}>
            {pending === "approve" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <CheckCircle2 data-icon="inline-start" />
            )}
            Approve refund
          </Button>
          <Button
            onClick={() => handle(false)}
            disabled={pending !== null}
            variant="outline"
          >
            {pending === "reject" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <XCircle data-icon="inline-start" />
            )}
            Reject and escalate
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
