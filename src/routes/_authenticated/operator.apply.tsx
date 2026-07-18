import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AppShell,
  Screen,
  Display,
  Eyebrow,
  Muted,
  Body,
  Button,
  Card,
  CardBody,
} from "@/components/ds";
import { upsertOperatorApplication } from "@/lib/operators.functions";
import type { Database } from "@/integrations/supabase/types";

type Business = Database["public"]["Tables"]["operator_businesses"]["Row"];
type Province = Database["public"]["Enums"]["sa_province"];
type TerminalProvider = Database["public"]["Enums"]["terminal_provider"];

export const Route = createFileRoute("/_authenticated/operator/apply")({
  head: () => ({ meta: [{ title: "Operator application · CashNear" }] }),
  component: OperatorApply,
});

const PROVINCES: { value: Province; label: string }[] = [
  { value: "gauteng", label: "Gauteng" },
  { value: "western_cape", label: "Western Cape" },
  { value: "kwazulu_natal", label: "KwaZulu-Natal" },
  { value: "eastern_cape", label: "Eastern Cape" },
  { value: "free_state", label: "Free State" },
  { value: "limpopo", label: "Limpopo" },
  { value: "mpumalanga", label: "Mpumalanga" },
  { value: "north_west", label: "North West" },
  { value: "northern_cape", label: "Northern Cape" },
];

const TERMINALS: { value: TerminalProvider; label: string }[] = [
  { value: "yoco", label: "Yoco" },
  { value: "ikhokha", label: "iKhokha" },
  { value: "fnb", label: "FNB" },
  { value: "standard_bank", label: "Standard Bank" },
  { value: "nedbank", label: "Nedbank" },
  { value: "absa", label: "Absa" },
  { value: "kazang", label: "Kazang" },
  { value: "flash", label: "Flash" },
  { value: "other", label: "Other" },
];

type FormState = {
  business_id?: string;
  legal_name: string;
  trading_name: string;
  business_type: string;
  registration_number: string;
  tax_number: string;
  years_operating: string;
  description: string;
  street_address: string;
  suburb: string;
  city: string;
  province: Province;
  postal_code: string;
  premises_type: string;
  terminal_provider: TerminalProvider | "";
  terminal_model: string;
  representative_name: string;
  representative_id_number: string;
  representative_mobile: string;
  representative_email: string;
  representative_relationship: string;
  agreements_accepted: boolean;
};

const empty: FormState = {
  legal_name: "",
  trading_name: "",
  business_type: "",
  registration_number: "",
  tax_number: "",
  years_operating: "",
  description: "",
  street_address: "",
  suburb: "",
  city: "",
  province: "gauteng",
  postal_code: "",
  premises_type: "",
  terminal_provider: "",
  terminal_model: "",
  representative_name: "",
  representative_id_number: "",
  representative_mobile: "",
  representative_email: "",
  representative_relationship: "",
  agreements_accepted: false,
};

function OperatorApply() {
  const navigate = useNavigate();
  const upsert = useServerFn(upsertOperatorApplication);
  const [form, setForm] = useState<FormState>(empty);
  const [existing, setExisting] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data } = await supabase
        .from("operator_businesses")
        .select("*")
        .eq("owner_id", userData.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setExisting(data);
        setForm({
          business_id: data.id,
          legal_name: data.legal_name ?? "",
          trading_name: data.trading_name ?? "",
          business_type: data.business_type ?? "",
          registration_number: data.registration_number ?? "",
          tax_number: data.tax_number ?? "",
          years_operating: data.years_operating ? String(data.years_operating) : "",
          description: data.description ?? "",
          street_address: data.street_address ?? "",
          suburb: data.suburb ?? "",
          city: data.city ?? "",
          province: (data.province as Province) ?? "gauteng",
          postal_code: data.postal_code ?? "",
          premises_type: data.premises_type ?? "",
          terminal_provider: (data.terminal_provider as TerminalProvider) ?? "",
          terminal_model: data.terminal_model ?? "",
          representative_name: data.representative_name ?? "",
          representative_id_number: data.representative_id_number ?? "",
          representative_mobile: data.representative_mobile ?? "",
          representative_email: data.representative_email ?? "",
          representative_relationship: data.representative_relationship ?? "",
          agreements_accepted: !!data.agreements_accepted_at,
        });
      }
      setLoading(false);
    })();
  }, []);

  const locked = useMemo(() => {
    return (
      existing &&
      existing.application_status !== "draft" &&
      existing.application_status !== "info_requested"
    );
  }, [existing]);

  const submit = async (mode: "save" | "submit") => {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const payload = {
        business_id: form.business_id,
        legal_name: form.legal_name,
        trading_name: form.trading_name,
        business_type: form.business_type,
        registration_number: form.registration_number,
        tax_number: form.tax_number,
        years_operating: form.years_operating ? Number(form.years_operating) : undefined,
        description: form.description,
        street_address: form.street_address,
        suburb: form.suburb,
        city: form.city,
        province: form.province,
        postal_code: form.postal_code,
        premises_type: form.premises_type,
        terminal_provider:
          form.terminal_provider === "" ? undefined : form.terminal_provider,
        terminal_model: form.terminal_model,
        representative_name: form.representative_name,
        representative_id_number: form.representative_id_number,
        representative_mobile: form.representative_mobile,
        representative_email: form.representative_email,
        representative_relationship: form.representative_relationship,
        agreements_accepted: form.agreements_accepted,
        submit: mode === "submit",
      };
      const res = await upsert({ data: payload });
      setForm((f) => ({ ...f, business_id: res.business_id }));
      if (mode === "submit") {
        setOk("Application submitted. Our operations team will review shortly.");
        setTimeout(() => navigate({ to: "/operator/dashboard", replace: true }), 800);
      } else {
        setOk("Draft saved.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AppShell hideNav>
        <Screen>
          <Muted>Loading…</Muted>
        </Screen>
      </AppShell>
    );
  }

  return (
    <AppShell hideNav>
      <Screen>
        <div className="pt-2">
          <Link
            to="/home"
            className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground"
          >
            ← Back
          </Link>
        </div>

        <div>
          <Eyebrow>Operator application</Eyebrow>
          <Display className="mt-4 text-[42px]">Apply to run cash.</Display>
          <Muted className="mt-3 max-w-[36ch]">
            Operators are manually verified by CashNear operations. Provide accurate details — we
            confirm ID, business registration, and premises before activation.
          </Muted>
        </div>

        {locked ? (
          <Card variant="lift">
            <CardBody>
              <Eyebrow>Application locked</Eyebrow>
              <Body className="mt-2 text-[14px] text-muted-foreground">
                Your application is currently{" "}
                <span className="text-foreground">{existing?.application_status}</span>. You cannot
                edit while it's in review.
              </Body>
              <Link to="/operator/dashboard" className="mt-4 inline-block">
                <Button variant="secondary">View status</Button>
              </Link>
            </CardBody>
          </Card>
        ) : (
          <>
            <Section title="Business">
              <Field label="Legal name" value={form.legal_name} onChange={(v) => setForm({ ...form, legal_name: v })} />
              <Field label="Trading name" value={form.trading_name} onChange={(v) => setForm({ ...form, trading_name: v })} />
              <Field
                label="Business type (e.g. Spaza, salon, café)"
                value={form.business_type}
                onChange={(v) => setForm({ ...form, business_type: v })}
              />
              <Two>
                <Field label="Registration #" value={form.registration_number} onChange={(v) => setForm({ ...form, registration_number: v })} />
                <Field label="Tax #" value={form.tax_number} onChange={(v) => setForm({ ...form, tax_number: v })} />
              </Two>
              <Two>
                <Field label="Years operating" type="number" value={form.years_operating} onChange={(v) => setForm({ ...form, years_operating: v })} />
                <Field label="Premises type" value={form.premises_type} onChange={(v) => setForm({ ...form, premises_type: v })} />
              </Two>
              <TextArea label="Short description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
            </Section>

            <Section title="Location">
              <Field label="Street address" value={form.street_address} onChange={(v) => setForm({ ...form, street_address: v })} />
              <Two>
                <Field label="Suburb" value={form.suburb} onChange={(v) => setForm({ ...form, suburb: v })} />
                <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
              </Two>
              <Two>
                <Select
                  label="Province"
                  value={form.province}
                  onChange={(v) => setForm({ ...form, province: v as Province })}
                  options={PROVINCES}
                />
                <Field label="Postal code" value={form.postal_code} onChange={(v) => setForm({ ...form, postal_code: v })} />
              </Two>
            </Section>

            <Section title="Card acceptance">
              <Two>
                <Select
                  label="Terminal provider"
                  value={form.terminal_provider}
                  onChange={(v) => setForm({ ...form, terminal_provider: v as TerminalProvider | "" })}
                  options={[{ value: "", label: "— Select —" }, ...TERMINALS]}
                />
                <Field label="Terminal model" value={form.terminal_model} onChange={(v) => setForm({ ...form, terminal_model: v })} />
              </Two>
            </Section>

            <Section title="Representative">
              <Field label="Full name" value={form.representative_name} onChange={(v) => setForm({ ...form, representative_name: v })} />
              <Two>
                <Field label="SA ID number" value={form.representative_id_number} onChange={(v) => setForm({ ...form, representative_id_number: v })} />
                <Field label="Mobile" value={form.representative_mobile} onChange={(v) => setForm({ ...form, representative_mobile: v })} />
              </Two>
              <Two>
                <Field label="Email" type="email" value={form.representative_email} onChange={(v) => setForm({ ...form, representative_email: v })} />
                <Field label="Relationship" value={form.representative_relationship} onChange={(v) => setForm({ ...form, representative_relationship: v })} />
              </Two>
            </Section>

            <label className="flex items-start gap-3 rounded-2xl border border-border-strong bg-surface p-4 text-[13px] text-muted-foreground">
              <input
                type="checkbox"
                checked={form.agreements_accepted}
                onChange={(e) => setForm({ ...form, agreements_accepted: e.target.checked })}
                className="mt-1 h-4 w-4 accent-gold"
              />
              <span>
                I confirm the information above is accurate. I accept the CashNear operator{" "}
                <Link to="/legal/terms" className="underline">
                  terms
                </Link>{" "}
                and{" "}
                <Link to="/legal/privacy" className="underline">
                  privacy notice
                </Link>
                .
              </span>
            </label>

            {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
            {ok ? <p className="text-[13px] text-success">{ok}</p> : null}

            <div className="flex flex-col gap-3">
              <Button
                onClick={() => submit("submit")}
                disabled={busy || !form.agreements_accepted}
                size="lg"
                fullWidth
              >
                {busy ? "…" : "Submit for review"}
              </Button>
              <Button
                onClick={() => submit("save")}
                variant="ghost"
                size="lg"
                fullWidth
                disabled={busy}
              >
                Save draft
              </Button>
            </div>
          </>
        )}
      </Screen>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <Eyebrow>{title}</Eyebrow>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
function Two({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}
function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-xl border border-border-strong bg-surface px-3 text-[14px] focus:border-gold focus:outline-none"
      />
    </label>
  );
}
function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-border-strong bg-surface px-3 py-2 text-[14px] focus:border-gold focus:outline-none"
      />
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-xl border border-border-strong bg-surface px-3 text-[14px] focus:border-gold focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
