import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type RefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requireAdminBeforeLoad } from "@/lib/admin-route-guard";
import { reviewCustomerVerification } from "@/lib/admin.functions";
import { ConfirmActionDialog } from "@/components/admin/ConfirmActionDialog";
import { DocumentLink } from "@/components/admin/DocumentLink";
import { StatusBadge, CUSTOMER_STATUS_TONE } from "@/components/admin/StatusBadge";
import { AppShell, Screen, Eyebrow, Display, Muted, Card, CardBody } from "@/components/ds";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEMO_CUSTOMER_USER_ID } from "@/lib/demo-accounts";
import type { Database } from "@/integrations/supabase/types";

type CustomerProfile = Database["public"]["Tables"]["customer_profiles"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type AuditLog = Database["public"]["Tables"]["audit_logs"]["Row"];

export const Route = createFileRoute("/_authenticated/admin/customers")({
  head: () => ({ meta: [{ title: "Customer verification · CashNear Ops" }] }),
  beforeLoad: () => requireAdminBeforeLoad(),
  component: AdminCustomers,
});

const FILTERS = ["all", "pending", "unverified", "approved", "rejected", "suspended"] as const;

function AdminCustomers() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending");
  const [rows, setRows] = useState<CustomerProfile[] | null>(null);
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CustomerProfile | null>(null);
  // The customer review dialog is controlled externally (no Radix
  // DialogTrigger, since the trigger is one of many rows in this list) --
  // Radix has no triggerRef of its own to restore focus to on close, so we
  // track the exact row button ourselves and hand it to the dialog's
  // onCloseAutoFocus handler. A ref, not state: this is imperative DOM
  // bookkeeping, not something that should ever cause a re-render.
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const load = async () => {
    setLoadError(null);
    let q = supabase
      .from("customer_profiles")
      .select("*")
      .order("submitted_at", { ascending: false, nullsFirst: false });
    if (filter !== "all") q = q.eq("verification_status", filter);
    const { data, error } = await q;
    if (error) {
      setLoadError(error.message);
      setRows([]);
      return;
    }
    setRows(data ?? []);

    const userIds = (data ?? []).map((r) => r.user_id);
    if (userIds.length > 0) {
      const { data: profileRows } = await supabase.from("profiles").select("*").in("id", userIds);
      const map: Record<string, Profile> = {};
      for (const p of profileRows ?? []) map[p.id] = p;
      setProfilesById(map);
    } else {
      setProfilesById({});
    }
  };

  useEffect(() => {
    setRows(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <AppShell hideNav desktopWide>
      <Screen>
        <div className="pt-2">
          <AdminTabs />
        </div>
        <Eyebrow>Customer verification</Eyebrow>
        <Display className="text-[44px]">KYC review queue.</Display>
        <Muted>Review submitted identity documents. Approve, or reject with a reason.</Muted>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                (f === filter
                  ? "border-gold text-foreground"
                  : "border-border-strong text-muted-foreground hover:text-foreground") +
                " rounded-full border px-4 py-1.5 text-[12px] uppercase tracking-[0.18em]"
              }
            >
              {f}
            </button>
          ))}
        </div>

        {loadError ? (
          <Card variant="outline">
            <CardBody>
              <p role="alert" className="text-[13px] text-destructive">
                Could not load the queue: {loadError}
              </p>
            </CardBody>
          </Card>
        ) : !rows ? (
          <Muted>Loading…</Muted>
        ) : rows.length === 0 ? (
          <Card variant="outline">
            <CardBody>
              <Muted>No customers match this filter.</Muted>
            </CardBody>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((c) => {
              const profile = profilesById[c.user_id];
              const tone = CUSTOMER_STATUS_TONE[c.verification_status] ?? "muted";
              return (
                <button
                  key={c.user_id}
                  onClick={(e) => {
                    triggerRef.current = e.currentTarget;
                    setSelected(c);
                  }}
                  className="text-left"
                >
                  <Card variant="quiet" className="transition-colors hover:bg-surface">
                    <CardBody className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-3">
                          <span className="truncate font-display text-[18px] text-foreground">
                            {c.full_legal_name || profile?.full_name || profile?.email || "Unnamed"}
                          </span>
                          {c.user_id === DEMO_CUSTOMER_USER_ID ? (
                            <StatusBadge label="Demo" tone="muted" />
                          ) : null}
                          <StatusBadge label={c.verification_status} tone={tone} />
                        </div>
                        <p className="mt-1 text-[13px] text-muted-foreground">
                          {profile?.email ?? "—"} · {c.mobile_number ?? "—"}
                        </p>
                      </div>
                      <div className="text-right text-[11px] text-muted-foreground">
                        {c.submitted_at ? new Date(c.submitted_at).toLocaleDateString() : "—"}
                      </div>
                    </CardBody>
                  </Card>
                </button>
              );
            })}
          </div>
        )}

        <CustomerReviewDialog
          customer={selected}
          profile={selected ? profilesById[selected.user_id] : undefined}
          triggerRef={triggerRef}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          onDecided={() => {
            setSelected(null);
            void load();
          }}
        />
      </Screen>
    </AppShell>
  );
}

function isFocusable(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  if ((el as HTMLButtonElement).disabled) return false;
  if (el.tabIndex < 0) return false;
  return true;
}

function CustomerReviewDialog({
  customer,
  profile,
  triggerRef,
  onOpenChange,
  onDecided,
}: {
  customer: CustomerProfile | null;
  profile: Profile | undefined;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
  onDecided: () => void;
}) {
  const review = useServerFn(reviewCustomerVerification);
  const [history, setHistory] = useState<AuditLog[] | null>(null);
  const [pendingDecision, setPendingDecision] = useState<"approved" | "rejected" | null>(null);

  useEffect(() => {
    if (!customer) {
      setHistory(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("entity_type", "customer_profile")
        .eq("entity_id", customer.user_id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (!cancelled) setHistory(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [customer]);

  const decide = async (decision: "approved" | "rejected", reason: string) => {
    if (!customer) return;
    await review({
      data: { customer_user_id: customer.user_id, decision, note: reason || undefined },
    });
  };

  return (
    <>
      {/* Radix Dialog: provides role="dialog"/aria-modal (via the shared
          ui/dialog.tsx wrapper), a focus trap, initial focus on open, and
          Escape-to-close for free. The hand-rolled overlay this replaced
          had none of those (found during authenticated staging QA).
          Focus-restore-to-trigger is NOT automatic here, though -- Radix
          only does that through its own DialogTrigger, which this dialog
          doesn't use (the trigger is one row among many in a list, not
          colocated with the dialog); see the triggerRef/onCloseAutoFocus
          wiring on DialogContent below for the explicit version. */}
      <Dialog
        open={customer !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDecision(null);
          onOpenChange(open);
        }}
      >
        <DialogContent
          className="max-w-2xl"
          onCloseAutoFocus={(event) => {
            const el = triggerRef.current;
            triggerRef.current = null;
            if (el && isFocusable(el)) {
              // Radix would otherwise send focus to document.body here,
              // since this dialog has no DialogTrigger of its own for it
              // to fall back to -- restore it to the exact row button that
              // opened the dialog instead.
              event.preventDefault();
              el.focus();
            }
            // else: no valid trigger left (e.g. the row was removed from
            // the list after a decision) -- let Radix's own default
            // behaviour run rather than forcing a fallback ourselves.
          }}
        >
          {customer ? (
            <>
              <DialogHeader>
                <Eyebrow>
                  Verification review
                  {customer.user_id === DEMO_CUSTOMER_USER_ID ? " · Demo account" : ""}
                </Eyebrow>
                <DialogTitle className="font-display text-[26px] font-normal tracking-normal text-foreground">
                  {customer.full_legal_name || profile?.full_name || "Unnamed customer"}
                </DialogTitle>
              </DialogHeader>

              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-[13px]">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <StatusBadge
                    label={customer.verification_status}
                    tone={CUSTOMER_STATUS_TONE[customer.verification_status] ?? "muted"}
                  />
                </dd>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="text-foreground">{profile?.email ?? "—"}</dd>
                <dt className="text-muted-foreground">Mobile</dt>
                <dd className="text-foreground">{customer.mobile_number ?? "—"}</dd>
                <dt className="text-muted-foreground">ID type</dt>
                <dd className="text-foreground">{customer.id_document_type ?? "—"}</dd>
                <dt className="text-muted-foreground">ID number</dt>
                <dd className="text-foreground">{customer.id_document_number ?? "—"}</dd>
                <dt className="text-muted-foreground">Suburb</dt>
                <dd className="text-foreground">{customer.saved_suburb ?? "—"}</dd>
                <dt className="text-muted-foreground">Submitted</dt>
                <dd className="text-foreground">
                  {customer.submitted_at ? new Date(customer.submitted_at).toLocaleString() : "—"}
                </dd>
                {customer.reviewed_at ? (
                  <>
                    <dt className="text-muted-foreground">Last reviewed</dt>
                    <dd className="text-foreground">
                      {new Date(customer.reviewed_at).toLocaleString()}
                      {customer.review_notes ? ` — ${customer.review_notes}` : ""}
                    </dd>
                  </>
                ) : null}
              </dl>

              <div className="flex flex-wrap gap-3">
                {customer.id_document_path ? (
                  <DocumentLink
                    bucket="customer-documents"
                    path={customer.id_document_path}
                    label="View ID document"
                  />
                ) : null}
                {customer.selfie_path ? (
                  <DocumentLink
                    bucket="customer-documents"
                    path={customer.selfie_path}
                    label="View selfie"
                  />
                ) : null}
              </div>

              <div>
                <Eyebrow>Recent activity</Eyebrow>
                <div className="mt-2 flex flex-col gap-1.5">
                  {history === null ? (
                    <Muted>Loading…</Muted>
                  ) : history.length === 0 ? (
                    <Muted>No recorded activity yet.</Muted>
                  ) : (
                    history.map((h) => (
                      <div key={h.id} className="text-[12px] text-muted-foreground">
                        {new Date(h.created_at).toLocaleString()} — {h.action}
                        {h.actor_role ? ` (${h.actor_role})` : ""}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setPendingDecision("approved")}
                  className="rounded-full bg-success px-5 py-2 text-[13px] font-medium text-success-foreground hover:brightness-105"
                >
                  Approve
                </button>
                <button
                  onClick={() => setPendingDecision("rejected")}
                  className="rounded-full bg-destructive px-5 py-2 text-[13px] font-medium text-destructive-foreground hover:brightness-105"
                >
                  Reject
                </button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={pendingDecision !== null}
        onOpenChange={(o) => !o && setPendingDecision(null)}
        title={
          pendingDecision === "approved" ? "Approve this customer?" : "Reject this verification?"
        }
        description={
          pendingDecision === "approved"
            ? "This confirms their identity has been manually reviewed and verified."
            : "This will be recorded and the customer will need to resubmit their information."
        }
        confirmLabel={pendingDecision === "approved" ? "Approve" : "Reject"}
        requireReason={pendingDecision === "rejected"}
        reasonLabel="Reason for rejection"
        destructive={pendingDecision === "rejected"}
        onConfirm={async (reason) => {
          if (!pendingDecision) return;
          await decide(pendingDecision, reason);
        }}
        onSuccess={onDecided}
      />
    </>
  );
}
