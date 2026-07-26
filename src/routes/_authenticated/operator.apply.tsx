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
import {
  uploadOperatorDocument,
  ALLOWED_OPERATOR_DOCUMENT_MIME_TYPES,
} from "@/lib/operator-documents-client";
import {
  IDENTITY_DOCUMENT_TYPES,
  IDENTITY_DOCUMENT_LABELS,
  BUSINESS_STRUCTURE_TYPES,
  BUSINESS_STRUCTURE_LABELS,
  requiresImmigrationStatusDocument,
  getRequiredDocuments,
  getCompletionChecklist,
  isApplicationComplete,
  type IdentityDocumentType,
  type BusinessStructureType,
} from "@/lib/operator-document-requirements";
import type { Database } from "@/integrations/supabase/types";

type Business = Database["public"]["Tables"]["operator_businesses"]["Row"];
type OperatorDoc = Database["public"]["Tables"]["operator_documents"]["Row"];
type Province = Database["public"]["Enums"]["sa_province"];
type TerminalProvider = Database["public"]["Enums"]["terminal_provider"];

export const Route = createFileRoute("/_authenticated/operator/apply")({
  head: () => ({ meta: [{ title: "Register your business · CashNear" }] }),
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

const ID_NUMBER_LABEL: Record<IdentityDocumentType, string> = {
  sa_id: "ID number",
  passport: "Passport number",
  asylum_permit: "Permit number",
  refugee_permit: "Document number",
  permanent_residence_permit: "Permit number",
};

type FormState = {
  business_id?: string;
  legal_name: string;
  trading_name: string;
  business_type: string;
  business_structure: BusinessStructureType | "";
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
  representative_id_type: IdentityDocumentType | "";
  representative_id_number: string;
  representative_id_country: string;
  representative_id_expiry: string;
  representative_immigration_status_type: string;
  representative_immigration_status_number: string;
  representative_immigration_status_expiry: string;
  representative_mobile: string;
  representative_email: string;
  representative_relationship: string;
  agreements_accepted: boolean;
};

const empty: FormState = {
  legal_name: "",
  trading_name: "",
  business_type: "",
  business_structure: "",
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
  representative_id_type: "",
  representative_id_number: "",
  representative_id_country: "",
  representative_id_expiry: "",
  representative_immigration_status_type: "",
  representative_immigration_status_number: "",
  representative_immigration_status_expiry: "",
  representative_mobile: "",
  representative_email: "",
  representative_relationship: "",
  agreements_accepted: false,
};

function OperatorApply() {
  const navigate = useNavigate();
  const upsert = useServerFn(upsertOperatorApplication);
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [existing, setExisting] = useState<Business | null>(null);
  const [documents, setDocuments] = useState<OperatorDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [readyToRegister, setReadyToRegister] = useState(false);

  const loadDocuments = async (businessId: string) => {
    // Newest first, so that documents.find(doc_type === ...) below always
    // resolves to the most recently uploaded document for a slot even if a
    // stale duplicate is ever left behind by a failed best-effort cleanup
    // (see uploadOperatorDocument's replacement algorithm).
    const { data, error } = await supabase
      .from("operator_documents")
      .select("*")
      .eq("business_id", businessId)
      .order("uploaded_at", { ascending: false });
    if (error) return; // keep the previous list rather than silently clearing it
    setDocuments(data ?? []);
  };

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      setUserId(userData.user.id);
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
          business_structure: (data.business_structure as BusinessStructureType) ?? "",
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
          representative_id_type: (data.representative_id_type as IdentityDocumentType) ?? "",
          representative_id_number: data.representative_id_number ?? "",
          representative_id_country: data.representative_id_country ?? "",
          representative_id_expiry: data.representative_id_expiry ?? "",
          representative_immigration_status_type: data.representative_immigration_status_type ?? "",
          representative_immigration_status_number:
            data.representative_immigration_status_number ?? "",
          representative_immigration_status_expiry:
            data.representative_immigration_status_expiry ?? "",
          representative_mobile: data.representative_mobile ?? "",
          representative_email: data.representative_email ?? "",
          representative_relationship: data.representative_relationship ?? "",
          agreements_accepted: !!data.agreements_accepted_at,
        });
        await loadDocuments(data.id);
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

  const identityType = (form.representative_id_type || null) as IdentityDocumentType | null;
  const businessStructure = (form.business_structure || null) as BusinessStructureType | null;

  const requiredDocuments = useMemo(
    () => getRequiredDocuments({ identityType, businessStructure }),
    [identityType, businessStructure],
  );

  const checklist = useMemo(
    () =>
      getCompletionChecklist({
        business: {
          legal_name: form.legal_name || null,
          trading_name: form.trading_name || null,
          business_type: form.business_type || null,
          street_address: form.street_address || null,
          suburb: form.suburb || null,
          city: form.city || null,
          province: form.province || null,
          postal_code: form.postal_code || null,
          representative_name: form.representative_name || null,
          representative_id_number: form.representative_id_number || null,
          representative_mobile: form.representative_mobile || null,
          representative_email: form.representative_email || null,
        },
        identityType,
        businessStructure,
        uploadedDocTypes: documents.map((d) => d.doc_type),
      }),
    [form, identityType, businessStructure, documents],
  );

  const complete = isApplicationComplete(checklist);

  const submit = async (mode: "save" | "submit") => {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      if (mode === "submit" && !complete) {
        throw new Error("We still need some documents. Check the list above.");
      }
      const payload = {
        business_id: form.business_id,
        legal_name: form.legal_name,
        trading_name: form.trading_name,
        business_type: form.business_type,
        business_structure: form.business_structure || undefined,
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
        terminal_provider: form.terminal_provider === "" ? undefined : form.terminal_provider,
        terminal_model: form.terminal_model,
        representative_name: form.representative_name,
        representative_id_type: form.representative_id_type || undefined,
        representative_id_number: form.representative_id_number,
        representative_id_country: form.representative_id_country,
        representative_id_expiry: form.representative_id_expiry,
        representative_immigration_status_type: form.representative_immigration_status_type,
        representative_immigration_status_number: form.representative_immigration_status_number,
        representative_immigration_status_expiry: form.representative_immigration_status_expiry,
        representative_mobile: form.representative_mobile,
        representative_email: form.representative_email,
        representative_relationship: form.representative_relationship,
        agreements_accepted: form.agreements_accepted,
        submit: mode === "submit",
      };
      const res = await upsert({ data: payload });
      setForm((f) => ({ ...f, business_id: res.business_id }));
      if (mode === "submit") {
        setOk("Sent. We will check your business soon.");
        setTimeout(() => navigate({ to: "/operator/dashboard", replace: true }), 800);
      } else {
        setOk("Draft saved.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not do that. Please try again.");
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

  if (locked) {
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
          <Card variant="lift">
            <CardBody>
              <Eyebrow>Application</Eyebrow>
              <Body className="mt-2 text-[14px] text-muted-foreground">
                We are checking your application. You cannot change it right now.
              </Body>
              <Link to="/operator/dashboard" className="mt-4 inline-block">
                <Button variant="secondary">Check my status</Button>
              </Link>
            </CardBody>
          </Card>
        </Screen>
      </AppShell>
    );
  }

  if (!existing && !readyToRegister) {
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
            <Eyebrow>Register your business</Eyebrow>
            <Display className="mt-4 text-[38px]">Before you register</Display>
            <Muted className="mt-3 max-w-[46ch]">
              Have these documents ready. This will make registration quicker.
            </Muted>
          </div>
          <ul className="flex flex-col gap-3 text-[15px] text-foreground">
            {[
              "Your ID, passport or permit",
              "Proof of your business",
              "Proof of your shop address",
              "A photo of your card machine",
              "A photo of your shop",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                {item}
              </li>
            ))}
          </ul>
          <Card variant="outline">
            <CardBody>
              <Body className="text-[13px] text-muted-foreground">
                Foreign nationals may also need a valid permit or visa showing that they may work or
                run a business in South Africa.
              </Body>
            </CardBody>
          </Card>
          <div className="flex flex-col gap-3">
            <Button size="lg" onClick={() => setReadyToRegister(true)}>
              I'm ready
            </Button>
            <Link to="/home">
              <Button variant="ghost" fullWidth>
                Go back
              </Button>
            </Link>
          </div>
        </Screen>
      </AppShell>
    );
  }

  return (
    <AppShell hideNav>
      <Screen>
        <div className="pt-2">
          <Link to="/home" className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
            ← Back
          </Link>
        </div>

        <div>
          <Eyebrow>Register your business</Eyebrow>
          <Display className="mt-4 text-[42px]">Tell us about your business.</Display>
          <Muted className="mt-3 max-w-[36ch]">
            We check every business by hand. Give correct details. We check your ID, business
            papers, and shop before approval.
          </Muted>
        </div>

        <Section title="Business">
          <Field
            label="Legal name"
            value={form.legal_name}
            onChange={(v) => setForm({ ...form, legal_name: v })}
          />
          <Field
            label="Trading name"
            value={form.trading_name}
            onChange={(v) => setForm({ ...form, trading_name: v })}
          />
          <Field
            label="Business type (e.g. Spaza, salon, café)"
            value={form.business_type}
            onChange={(v) => setForm({ ...form, business_type: v })}
          />
          <Select
            label="Business structure"
            value={form.business_structure}
            onChange={(v) => setForm({ ...form, business_structure: v as BusinessStructureType })}
            options={[
              { value: "", label: "— Select —" },
              ...BUSINESS_STRUCTURE_TYPES.map((t) => ({
                value: t,
                label: BUSINESS_STRUCTURE_LABELS[t],
              })),
            ]}
          />
          <Two>
            <Field
              label="Registration number"
              value={form.registration_number}
              onChange={(v) => setForm({ ...form, registration_number: v })}
            />
            <Field
              label="Tax number"
              value={form.tax_number}
              onChange={(v) => setForm({ ...form, tax_number: v })}
            />
          </Two>
          <Two>
            <Field
              label="Years operating"
              type="number"
              value={form.years_operating}
              onChange={(v) => setForm({ ...form, years_operating: v })}
            />
            <Field
              label="Premises type"
              value={form.premises_type}
              onChange={(v) => setForm({ ...form, premises_type: v })}
            />
          </Two>
          <TextArea
            label="Short description"
            value={form.description}
            onChange={(v) => setForm({ ...form, description: v })}
          />
        </Section>

        <Section title="Location">
          <Field
            label="Street address"
            value={form.street_address}
            onChange={(v) => setForm({ ...form, street_address: v })}
          />
          <Two>
            <Field
              label="Suburb"
              value={form.suburb}
              onChange={(v) => setForm({ ...form, suburb: v })}
            />
            <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
          </Two>
          <Two>
            <Select
              label="Province"
              value={form.province}
              onChange={(v) => setForm({ ...form, province: v as Province })}
              options={PROVINCES}
            />
            <Field
              label="Postal code"
              value={form.postal_code}
              onChange={(v) => setForm({ ...form, postal_code: v })}
            />
          </Two>
        </Section>

        <Section title="Card machine">
          <Two>
            <Select
              label="Card machine provider"
              value={form.terminal_provider}
              onChange={(v) => setForm({ ...form, terminal_provider: v as TerminalProvider | "" })}
              options={[{ value: "", label: "— Select —" }, ...TERMINALS]}
            />
            <Field
              label="Card machine model"
              value={form.terminal_model}
              onChange={(v) => setForm({ ...form, terminal_model: v })}
            />
          </Two>
        </Section>

        <Section title="Contact person">
          <Field
            label="Full name"
            value={form.representative_name}
            onChange={(v) => setForm({ ...form, representative_name: v })}
          />
          <Select
            label="What identity document do you have?"
            value={form.representative_id_type}
            onChange={(v) =>
              setForm({ ...form, representative_id_type: v as IdentityDocumentType | "" })
            }
            options={[
              { value: "", label: "— Select —" },
              ...IDENTITY_DOCUMENT_TYPES.map((t) => ({
                value: t,
                label: IDENTITY_DOCUMENT_LABELS[t],
              })),
            ]}
          />

          {identityType ? (
            <>
              <Two>
                <Field
                  label={ID_NUMBER_LABEL[identityType]}
                  value={form.representative_id_number}
                  onChange={(v) => setForm({ ...form, representative_id_number: v })}
                />
                {identityType !== "sa_id" ? (
                  <Field
                    label={identityType === "passport" ? "Country of issue" : "Country of origin"}
                    value={form.representative_id_country}
                    onChange={(v) => setForm({ ...form, representative_id_country: v })}
                  />
                ) : null}
              </Two>
              {identityType !== "sa_id" ? (
                <Field
                  label={identityType === "passport" ? "Passport expiry date" : "Expiry date"}
                  type="date"
                  value={form.representative_id_expiry}
                  onChange={(v) => setForm({ ...form, representative_id_expiry: v })}
                />
              ) : null}
            </>
          ) : null}

          {identityType && requiresImmigrationStatusDocument(identityType) ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-border-strong bg-surface p-4">
              <span className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
                Proof you may work or run a business in South Africa
              </span>
              <Field
                label="Document type (e.g. work visa, business visa)"
                value={form.representative_immigration_status_type}
                onChange={(v) => setForm({ ...form, representative_immigration_status_type: v })}
              />
              <Two>
                <Field
                  label="Document number"
                  value={form.representative_immigration_status_number}
                  onChange={(v) =>
                    setForm({ ...form, representative_immigration_status_number: v })
                  }
                />
                <Field
                  label="Expiry date"
                  type="date"
                  value={form.representative_immigration_status_expiry}
                  onChange={(v) =>
                    setForm({ ...form, representative_immigration_status_expiry: v })
                  }
                />
              </Two>
            </div>
          ) : null}

          <Two>
            <Field
              label="Mobile"
              value={form.representative_mobile}
              onChange={(v) => setForm({ ...form, representative_mobile: v })}
              placeholder="e.g. +27 82 123 4567"
            />
            <Field
              label="Email"
              type="email"
              value={form.representative_email}
              onChange={(v) => setForm({ ...form, representative_email: v })}
            />
          </Two>
          <Field
            label="Relationship"
            value={form.representative_relationship}
            onChange={(v) => setForm({ ...form, representative_relationship: v })}
          />
        </Section>

        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <Eyebrow>What we need from you</Eyebrow>
          {!form.business_id ? (
            <Card variant="outline">
              <CardBody>
                <Muted>
                  Save your details below first, then come back here to upload documents.
                </Muted>
              </CardBody>
            </Card>
          ) : (
            <>
              <Muted>
                Don't have one of these? Don't worry. We'll tell you if another document will work.
              </Muted>
              <div className="flex flex-col gap-3">
                {requiredDocuments.map((doc) => (
                  <DocumentCard
                    key={doc.key}
                    doc={doc}
                    uploaded={documents.find((d) => d.doc_type === doc.docType)}
                    businessId={form.business_id!}
                    userId={userId!}
                    onChanged={() => void loadDocuments(form.business_id!)}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        <label className="flex items-start gap-3 rounded-2xl border border-border-strong bg-surface p-4 text-[13px] text-muted-foreground">
          <input
            type="checkbox"
            checked={form.agreements_accepted}
            onChange={(e) => setForm({ ...form, agreements_accepted: e.target.checked })}
            className="mt-1 h-4 w-4 accent-gold"
          />
          <span>
            I confirm this information is correct. I agree to the CashNear business{" "}
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

        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <Eyebrow>Your application</Eyebrow>
          <div className="flex flex-col gap-2">
            {checklist.map((item) => (
              <div key={item.key} className="flex items-center justify-between text-[14px]">
                <span className="text-foreground">{item.label}</span>
                <span
                  className={
                    item.status === "done"
                      ? "text-success"
                      : item.status === "not_needed"
                        ? "text-muted-foreground"
                        : "text-gold"
                  }
                >
                  {item.status === "done"
                    ? "Done"
                    : item.status === "not_needed"
                      ? "Not needed"
                      : "Still needed"}
                </span>
              </div>
            ))}
          </div>
          <Muted className="text-[12px]">
            This shows what you've sent us, not whether your business has been approved yet.
          </Muted>
        </section>

        {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
        {ok ? <p className="text-[13px] text-success">{ok}</p> : null}

        <div className="flex flex-col gap-3">
          <Button
            onClick={() => submit("submit")}
            disabled={busy || !form.agreements_accepted || !complete}
            size="lg"
            fullWidth
          >
            {busy ? "…" : "Send my details"}
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
      </Screen>
    </AppShell>
  );
}

function DocumentCard({
  doc,
  uploaded,
  businessId,
  userId,
  onChanged,
}: {
  doc: ReturnType<typeof getRequiredDocuments>[number];
  uploaded: OperatorDoc | undefined;
  businessId: string;
  userId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      await uploadOperatorDocument(supabase, { businessId, docType: doc.docType, file, userId });
      onChanged();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "We could not send your document. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const acceptTypes = Array.from(ALLOWED_OPERATOR_DOCUMENT_MIME_TYPES).join(",");

  return (
    <Card variant={uploaded ? "outline" : "quiet"}>
      <CardBody className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[15px] text-foreground">
              {doc.label}
              {doc.required ? "" : " (optional)"}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">{doc.why}</p>
          </div>
          <span
            className={uploaded ? "text-[12px] text-success" : "text-[12px] text-muted-foreground"}
          >
            {uploaded ? "Uploaded ✓" : doc.required ? "Missing" : "Not sent"}
          </span>
        </div>
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border border-border-strong px-4 py-1.5 text-[12px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">
          {busy ? "Sending…" : uploaded ? "Replace" : "Upload"}
          <input
            type="file"
            accept={acceptTypes}
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
      </CardBody>
    </Card>
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
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
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
