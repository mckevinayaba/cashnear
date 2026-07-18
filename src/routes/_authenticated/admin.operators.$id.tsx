import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { reviewOperatorApplication } from "@/lib/admin.functions";
import type { Database } from "@/integrations/supabase/types";

type Business = Database["public"]["Tables"]["operator_businesses"]["Row"];
type Review = Database["public"]["Tables"]["verification_reviews"]["Row"];
type Decision = "approved" | "rejected" | "info_requested" | "site_verification_required" | "under_review" | "suspended";

export const Route = createFileRoute("/_authenticated/admin/operators/$id")({
  head: () => ({ meta: [{ title: "Operator review · CashNear Ops" }] }),
  component: OperatorReview,
});

function OperatorReview() {
  const { id } = Route.useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const review = useServerFn(reviewOperatorApplication);

  const [b, setB] = useState<Business | null>(null);
  const [history, setHistory] = useState<Review[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.isAdmin) navigate({ to: "/home", replace: true });
  }, [auth, navigate]);

  const load = async () => {
    const [biz, revs] = await Promise.all([
      supabase.from("operator_businesses").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("verification_reviews")
        .select("*")
        .eq("business_id", id)
        .order("created_at", { ascending: false }),
    ]);
    setB(biz.data);
    setHistory(revs.data ?? []);
  };

  useEffect(() => {
    load();
  }, [id]);

  const decide = async (decision: Decision) => {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await review({ data: { business_id: id, decision, note } });
      setOk(`Decision recorded: ${decision.replace("_", " ")}`);
      setNote("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (!b) {
    return (
      <AppShell hideNav desktopWide>
        <Screen>
          <Muted>Loading…</Muted>
        </Screen>
      </AppShell>
    );
  }

  return (
    <AppShell hideNav desktopWide>
      <Screen>
        <div className="pt-2">
          <Link to="/admin/operators" className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
            ← Queue
          </Link>
        </div>
        <Eyebrow>Application review</Eyebrow>
        <Display className="text-[42px]">{b.trading_name || b.legal_name}</Display>
        <Muted>
          {b.suburb ? `${b.suburb} · ` : ""}
          {b.city ?? "—"} · {b.province ?? "—"} · status{" "}
          <span className="text-foreground">{b.application_status}</span>
        </Muted>

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

        <Card variant="lift">
          <CardBody className="flex flex-col gap-3">
            <Eyebrow>Decision</Eyebrow>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reviewer note (visible to operator)"
              className="rounded-xl border border-border-strong bg-surface p-3 text-[14px] focus:border-gold focus:outline-none"
            />
            {err ? <p className="text-[13px] text-destructive">{err}</p> : null}
            {ok ? <p className="text-[13px] text-success">{ok}</p> : null}
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              <Button variant="success" disabled={busy} onClick={() => decide("approved")}>
                Approve
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => decide("under_review")}>
                Mark under review
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => decide("info_requested")}>
                Request info
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => decide("site_verification_required")}
              >
                Site visit
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => decide("suspended")}>
                Suspend
              </Button>
              <Button
                className="!bg-destructive !text-destructive-foreground"
                disabled={busy}
                onClick={() => decide("rejected")}
              >
                Reject
              </Button>
            </div>
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
                        <Body className="mt-1 text-[13px] text-muted-foreground">{h.decision_note}</Body>
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
