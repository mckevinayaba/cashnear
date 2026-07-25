import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AppShell,
  Screen,
  Eyebrow,
  Display,
  Muted,
  Body,
  Card,
  CardBody,
  Button,
} from "@/components/ds";
import { useAuth } from "@/hooks/use-auth";
import { reviewOperatorApplication, reinstateOperator } from "@/lib/admin.functions";
import { requireAdminBeforeLoad } from "@/lib/admin-route-guard";
import { allowedAdminTransitionsFrom, canReinstateFrom } from "@/lib/operator-application-state";
import { isReasonRequired } from "@/lib/admin-reason-validation";
import { ConfirmActionDialog } from "@/components/admin/ConfirmActionDialog";
import { DocumentLink } from "@/components/admin/DocumentLink";
import { StatusBadge, OPERATOR_STATUS_TONE } from "@/components/admin/StatusBadge";
import type { Database } from "@/integrations/supabase/types";

type Business = Database["public"]["Tables"]["operator_businesses"]["Row"];
type Review = Database["public"]["Tables"]["verification_reviews"]["Row"];
type OperatorDoc = Database["public"]["Tables"]["operator_documents"]["Row"];
type StaffRow = Database["public"]["Tables"]["operator_staff"]["Row"];
type TransitionTarget = ReturnType<typeof allowedAdminTransitionsFrom>[number];

const DECISION_LABEL: Record<string, string> = {
  approved: "Approve",
  rejected: "Reject",
  suspended: "Suspend",
  deactivated: "Deactivate",
  under_review: "Mark under review",
  info_requested: "Request info",
  site_verification_required: "Request site visit",
};

export const Route = createFileRoute("/_authenticated/admin/operators/$id")({
  head: () => ({ meta: [{ title: "Operator review · CashNear Ops" }] }),
  beforeLoad: () => requireAdminBeforeLoad(),
  component: OperatorReview,
});

function OperatorReview() {
  const { id } = Route.useParams();
  const auth = useAuth();
  const review = useServerFn(reviewOperatorApplication);
  const reinstate = useServerFn(reinstateOperator);

  const [b, setB] = useState<Business | null>(null);
  const [history, setHistory] = useState<Review[]>([]);
  const [documents, setDocuments] = useState<OperatorDoc[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] = useState<TransitionTarget | null>(null);
  const [pendingReinstate, setPendingReinstate] = useState(false);

  const load = async () => {
    setLoadError(null);
    const [biz, revs, docs, staffRows] = await Promise.all([
      supabase.from("operator_businesses").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("verification_reviews")
        .select("*")
        .eq("business_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("operator_documents")
        .select("*")
        .eq("business_id", id)
        .order("uploaded_at", { ascending: false }),
      supabase.from("operator_staff").select("*").eq("business_id", id),
    ]);
    if (biz.error) {
      setLoadError(biz.error.message);
      return;
    }
    setB(biz.data);
    setHistory(revs.data ?? []);
    setDocuments(docs.data ?? []);
    setStaff(staffRows.data ?? []);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loadError) {
    return (
      <AppShell hideNav desktopWide>
        <Screen>
          <p role="alert" className="text-[13px] text-destructive">
            Could not load this application: {loadError}
          </p>
        </Screen>
      </AppShell>
    );
  }

  if (!b) {
    return (
      <AppShell hideNav desktopWide>
        <Screen>
          <Muted>Loading…</Muted>
        </Screen>
      </AppShell>
    );
  }

  const availableTransitions = allowedAdminTransitionsFrom(b.application_status);
  const canReinstate = auth.hasRole("super_admin") && canReinstateFrom(b.application_status);

  return (
    <AppShell hideNav desktopWide>
      <Screen>
        <div className="pt-2">
          <Link
            to="/admin/operators"
            className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground"
          >
            ← Queue
          </Link>
        </div>
        <Eyebrow>Application review</Eyebrow>
        <Display className="text-[42px]">{b.trading_name || b.legal_name}</Display>
        <div className="flex items-center gap-3">
          <Muted>
            {b.suburb ? `${b.suburb} · ` : ""}
            {b.city ?? "—"} · {b.province ?? "—"}
          </Muted>
          <StatusBadge
            label={b.application_status}
            tone={OPERATOR_STATUS_TONE[b.application_status] ?? "muted"}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <DetailCard title="Business">
            <Row k="Legal name" v={b.legal_name} />
            <Row k="Trading name" v={b.trading_name} />
            <Row k="Type" v={b.business_type} />
            <Row k="Registration" v={b.registration_number} />
            <Row k="Tax" v={b.tax_number} />
            <Row k="Years operating" v={b.years_operating} />
            <Row k="Premises" v={b.premises_type} />
            <Row k="Description" v={b.description} />
          </DetailCard>
          <DetailCard title="Location">
            <Row k="Street" v={b.street_address} />
            <Row k="Suburb" v={b.suburb} />
            <Row k="City" v={b.city} />
            <Row k="Province" v={b.province} />
            <Row k="Postal" v={b.postal_code} />
          </DetailCard>
          <DetailCard title="Card acceptance">
            <Row k="Provider" v={b.terminal_provider} />
            <Row k="Model" v={b.terminal_model} />
            <Row k="Est. MDR (%)" v={b.estimated_mdr} />
          </DetailCard>
          <DetailCard title="Representative">
            <Row k="Name" v={b.representative_name} />
            <Row k="SA ID" v={b.representative_id_number} />
            <Row k="Mobile" v={b.representative_mobile} />
            <Row k="Email" v={b.representative_email} />
            <Row k="Relationship" v={b.representative_relationship} />
          </DetailCard>
        </div>

        <section>
          <Eyebrow>Staff</Eyebrow>
          <div className="mt-3 flex flex-col gap-2">
            {staff.length === 0 ? (
              <Muted>No staff on record.</Muted>
            ) : (
              staff.map((s) => (
                <Card key={s.id} variant="quiet">
                  <CardBody className="flex items-center justify-between gap-4 text-[13px]">
                    <span className="text-foreground">{s.role.replace("_", " ")}</span>
                    <span className={s.active ? "text-success" : "text-muted-foreground"}>
                      {s.active ? "Active" : "Inactive"}
                    </span>
                  </CardBody>
                </Card>
              ))
            )}
          </div>
        </section>

        <section>
          <Eyebrow>Documents</Eyebrow>
          <div className="mt-3 flex flex-wrap gap-3">
            {documents.length === 0 ? (
              <Muted>No documents uploaded.</Muted>
            ) : (
              documents.map((d) => (
                <DocumentLink
                  key={d.id}
                  bucket="operator-documents"
                  path={d.storage_path}
                  label={d.doc_type.replace(/_/g, " ")}
                />
              ))
            )}
          </div>
        </section>

        <Card variant="lift">
          <CardBody className="flex flex-col gap-3">
            <Eyebrow>Decision</Eyebrow>
            {availableTransitions.length === 0 && !canReinstate ? (
              <Muted>No further transitions are available from this status.</Muted>
            ) : (
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                {availableTransitions.map((decision) => (
                  <Button
                    key={decision}
                    variant={decision === "approved" ? "success" : "secondary"}
                    className={
                      decision === "rejected"
                        ? "!bg-destructive !text-destructive-foreground"
                        : undefined
                    }
                    onClick={() => setPendingDecision(decision)}
                  >
                    {DECISION_LABEL[decision] ?? decision}
                  </Button>
                ))}
                {canReinstate ? (
                  <Button variant="gold" onClick={() => setPendingReinstate(true)}>
                    Reinstate (super admin)
                  </Button>
                ) : null}
              </div>
            )}
          </CardBody>
        </Card>

        <section>
          <Eyebrow>Review history</Eyebrow>
          <div className="mt-3 flex flex-col gap-2">
            {history.length === 0 ? (
              <Muted>No prior reviews.</Muted>
            ) : (
              history.map((h) => (
                <Card key={h.id} variant="quiet">
                  <CardBody className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[13px] text-foreground">
                        {h.from_status ?? "—"} → <span className="text-gold">{h.to_status}</span>
                      </p>
                      {h.decision_note ? (
                        <Body className="mt-1 text-[13px] text-muted-foreground">
                          {h.decision_note}
                        </Body>
                      ) : null}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(h.created_at).toLocaleString()}
                    </span>
                  </CardBody>
                </Card>
              ))
            )}
          </div>
        </section>
      </Screen>

      <ConfirmActionDialog
        open={pendingDecision !== null}
        onOpenChange={(o) => !o && setPendingDecision(null)}
        title={
          pendingDecision
            ? `${DECISION_LABEL[pendingDecision] ?? pendingDecision} this application?`
            : ""
        }
        description="This decision is recorded and audited, and the operator is notified via their dashboard."
        confirmLabel={
          pendingDecision ? (DECISION_LABEL[pendingDecision] ?? pendingDecision) : "Confirm"
        }
        requireReason={pendingDecision ? isReasonRequired(pendingDecision) : false}
        reasonLabel={
          pendingDecision === "rejected" ? "Reason for rejection" : "Reason for suspension"
        }
        destructive={pendingDecision === "rejected" || pendingDecision === "suspended"}
        onConfirm={async (reason) => {
          if (!pendingDecision) return;
          await review({
            data: { business_id: id, decision: pendingDecision, note: reason || undefined },
          });
        }}
        onSuccess={() => void load()}
      />

      <ConfirmActionDialog
        open={pendingReinstate}
        onOpenChange={setPendingReinstate}
        title="Reinstate this operator?"
        description="Restores approved status and reactivates the staff this suspension deactivated. Only super_admin may do this, and you cannot reinstate a business you own or staff."
        confirmLabel="Reinstate"
        requireReason
        reasonLabel="Reinstatement reason"
        onConfirm={async (reason) => {
          await reinstate({ data: { business_id: id, reason } });
        }}
        onSuccess={() => void load()}
      />
    </AppShell>
  );
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card variant="quiet">
      <CardBody>
        <Eyebrow>{title}</Eyebrow>
        <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          {children}
        </dl>
      </CardBody>
    </Card>
  );
}
function Row({ k, v }: { k: string; v: unknown }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-foreground">{v == null || v === "" ? "—" : String(v)}</dd>
    </>
  );
}
