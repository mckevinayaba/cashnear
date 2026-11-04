import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { submitCustomerVerification, updateCustomerDocumentPath } from "@/lib/customer.functions";
import { uploadCustomerDocument } from "@/lib/customer-documents-client";
import {
  isValidMobileNumber,
  MOBILE_NUMBER_ERROR,
  MOBILE_NUMBER_HELPER_TEXT,
} from "@/lib/phone-number";
import {
  AppShell,
  Screen,
  Display,
  Muted,
  Eyebrow,
  Card,
  CardBody,
  Button,
  Body,
} from "@/components/ds";
import type { Database } from "@/integrations/supabase/types";

type CustomerProfile = Database["public"]["Tables"]["customer_profiles"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export const Route = createFileRoute("/_authenticated/customer")({
  head: () => ({ meta: [{ title: "Your CashNear account" }] }),
  component: Customer,
});

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  unverified: { label: "Not started", tone: "text-muted-foreground" },
  pending: { label: "Under review", tone: "text-gold" },
  approved: { label: "Verified", tone: "text-success" },
  rejected: { label: "Additional info needed", tone: "text-destructive" },
  suspended: { label: "Suspended", tone: "text-destructive" },
};

function Customer() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const refresh = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const [p, c] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userData.user.id).maybeSingle(),
      supabase.from("customer_profiles").select("*").eq("user_id", userData.user.id).maybeSingle(),
    ]);
    setProfile(p.data);
    setCustomer(c.data);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  const status = customer?.verification_status ?? "unverified";
  const isVerified = status === "approved";

  return (
    <AppShell hideNav>
      <Screen>
        <header className="flex items-center justify-between pt-2">
          <div>
            <Eyebrow>CashNear</Eyebrow>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {profile?.full_name ?? profile?.email ?? "Your account"}
            </p>
          </div>
          <button
            onClick={signOut}
            className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </header>

        {!showForm ? (
          <Card variant="lift">
            <CardBody className="flex flex-col gap-3">
              <Eyebrow>Get cash</Eyebrow>
              <Display className="text-[30px] leading-[1.1]">Need cash near you?</Display>
              <Body className="text-[14px] text-muted-foreground">
                See which shops can serve you, know the fee before you walk, and have the shop keep
                it aside.
              </Body>
              <Link to="/cash">
                <Button size="lg" fullWidth>
                  Get cash
                </Button>
              </Link>
            </CardBody>
          </Card>
        ) : null}

        {loading ? (
          <Muted>Loading your account…</Muted>
        ) : isVerified ? (
          <VerifiedHome />
        ) : showForm ? (
          <VerificationForm
            existing={customer}
            onCancel={() => setShowForm(false)}
            onDone={async () => {
              setShowForm(false);
              await refresh();
            }}
          />
        ) : (
          <VerificationSummary
            status={status}
            reviewNotes={customer?.review_notes ?? null}
            onStart={() => setShowForm(true)}
          />
        )}

        <Card variant="outline">
          <CardBody className="flex flex-col gap-3">
            <Eyebrow>Also available</Eyebrow>
            <Body className="text-[14px] text-muted-foreground">
              Do you own a shop with a card machine? You can register your business too.
            </Body>
            <Link to="/operator/apply">
              <Button variant="ghost" fullWidth>
                Register my business →
              </Button>
            </Link>
          </CardBody>
        </Card>
      </Screen>
    </AppShell>
  );
}

/* -------- Unverified / pending / rejected view -------- */

function VerificationSummary({
  status,
  reviewNotes,
  onStart,
}: {
  status: string;
  reviewNotes: string | null;
  onStart: () => void;
}) {
  const s = STATUS_COPY[status] ?? STATUS_COPY.unverified;
  const primaryLabel =
    status === "rejected"
      ? "Update my details"
      : status === "pending"
        ? "View my details"
        : "Send my details";

  const heading =
    status === "pending"
      ? "We are checking your details."
      : status === "rejected"
        ? "We still need more information."
        : "Check your details (optional).";

  const body =
    status === "pending"
      ? "We are checking your details. This usually takes one business day."
      : status === "rejected"
        ? reviewNotes || "Please check your details and try again with a clearer document."
        : "You can ask for cash without this. It is optional for now.";

  return (
    <>
      <div>
        <Display className="text-[44px]">{heading}</Display>
        <Muted className="mt-3 max-w-[36ch]">{body}</Muted>
      </div>

      <Card variant="lift">
        <CardBody className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <Eyebrow>Verification</Eyebrow>
            <span className={`text-[12px] ${s.tone}`}>{s.label}</span>
          </div>

          <ProgressBar status={status} />

          <ul className="flex flex-col gap-3 text-[14px] text-muted-foreground">
            <Line done={status !== "unverified"}>Account created</Line>
            <Line done={status === "pending" || status === "approved"}>Details sent</Line>
            <Line done={status === "approved"}>Approved</Line>
          </ul>

          {status !== "pending" ? (
            <Button onClick={onStart} size="lg">
              {primaryLabel}
            </Button>
          ) : (
            <Button variant="secondary" disabled size="lg">
              Sent — we are checking
            </Button>
          )}
        </CardBody>
      </Card>
    </>
  );
}

function ProgressBar({ status }: { status: string }) {
  const pct =
    status === "approved" ? 100 : status === "pending" ? 66 : status === "rejected" ? 33 : 12;
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Line({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${
          done
            ? "border-success bg-success/20 text-success"
            : "border-border-strong text-muted-foreground"
        } text-[10px]`}
      >
        {done ? "✓" : ""}
      </span>
      <span className={done ? "text-foreground" : ""}>{children}</span>
    </li>
  );
}

/* -------- Verified customer home -------- */

function VerifiedHome() {
  const [amount, setAmount] = useState(500);
  const presets = [200, 500, 1000, 2000];
  return (
    <>
      <div>
        <Display className="text-[44px]">Need cash nearby?</Display>
        <Muted className="mt-3 max-w-[34ch]">
          Cash requests are not open yet. We are checking shops first.
        </Muted>
      </div>

      <Card variant="lift">
        <CardBody className="flex flex-col gap-5">
          <Eyebrow>Amount (ZAR)</Eyebrow>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[64px] leading-none text-foreground">R</span>
            <input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value || 0))}
              className="w-full bg-transparent font-display text-[64px] leading-none text-foreground outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => setAmount(p)}
                className={`rounded-full border px-4 py-2 text-[13px] ${
                  amount === p
                    ? "border-gold text-gold"
                    : "border-border-strong text-muted-foreground hover:text-foreground"
                }`}
              >
                R{p}
              </button>
            ))}
          </div>
          <Button disabled size="lg">
            Cash requests are not open yet
          </Button>
        </CardBody>
      </Card>

      <Card variant="outline">
        <CardBody className="flex flex-col gap-2">
          <Eyebrow>Recent activity</Eyebrow>
          <Muted>No requests yet.</Muted>
        </CardBody>
      </Card>
    </>
  );
}

/* -------- Verification form -------- */

function VerificationForm({
  existing,
  onCancel,
  onDone,
}: {
  existing: CustomerProfile | null;
  onCancel: () => void;
  onDone: () => void;
}) {
  const submitFn = useServerFn(submitCustomerVerification);
  const updatePathFn = useServerFn(updateCustomerDocumentPath);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [fullName, setFullName] = useState(existing?.full_legal_name ?? "");
  const [mobile, setMobile] = useState(existing?.mobile_number ?? "");
  const [idType, setIdType] = useState<"sa_id" | "passport" | "asylum" | "refugee">(
    (existing?.id_document_type as "sa_id" | "passport" | "asylum" | "refugee") ?? "sa_id",
  );
  const [idNumber, setIdNumber] = useState(existing?.id_document_number ?? "");
  // Seeded from the existing record (not just blank) so that resubmitting
  // after rejection -- or simply fixing an unrelated field -- doesn't force
  // a customer to re-upload a document that's still on record, and so a
  // genuine replacement can find and clean up the previous object rather
  // than silently orphaning it.
  const [idPath, setIdPath] = useState<string | null>(existing?.id_document_path ?? null);
  const [selfiePath, setSelfiePath] = useState<string | null>(existing?.selfie_path ?? null);
  const [consent, setConsent] = useState(false);
  const [mobileError, setMobileError] = useState<string | null>(null);

  const upload = async (file: File, kind: "id" | "selfie", setPath: (p: string) => void) => {
    setUploading(true);
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in.");
      const { path } = await uploadCustomerDocument(supabase, updatePathFn, {
        userId: userData.user.id,
        kind,
        file,
      });
      setPath(path);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "We could not send your document. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  const canSubmit = useMemo(
    () =>
      fullName.trim().length >= 2 &&
      isValidMobileNumber(mobile) &&
      idNumber.trim().length >= 6 &&
      idPath &&
      consent &&
      !busy &&
      !uploading,
    [fullName, mobile, idNumber, idPath, consent, busy, uploading],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idPath) return;
    if (!isValidMobileNumber(mobile)) {
      setMobileError(MOBILE_NUMBER_ERROR);
      return;
    }
    setMobileError(null);
    setBusy(true);
    setError(null);
    try {
      await submitFn({
        data: {
          full_legal_name: fullName.trim(),
          mobile_number: mobile.trim(),
          id_document_type: idType,
          id_document_number: idNumber.trim(),
          id_document_path: idPath,
          selfie_path: selfiePath ?? "",
          consent,
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not do that. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <Eyebrow>Your details</Eyebrow>
        <Display className="mt-3 text-[36px]">Tell us who you are.</Display>
        <Muted className="mt-2 max-w-[36ch]">
          A person checks your details by hand. We never share them in public.
        </Muted>
      </div>

      <Field
        label="Full legal name"
        value={fullName}
        onChange={setFullName}
        placeholder="As on your ID"
        autoComplete="name"
      />
      <Field
        label="Mobile number"
        value={mobile}
        onChange={(v) => {
          setMobile(v);
          if (mobileError) setMobileError(null);
        }}
        placeholder="e.g. +27 82 123 4567"
        inputMode="tel"
        autoComplete="tel"
        helper={MOBILE_NUMBER_HELPER_TEXT}
        error={mobileError}
      />

      <label className="flex flex-col gap-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Identity document
        </span>
        <select
          value={idType}
          onChange={(e) => setIdType(e.target.value as typeof idType)}
          className="h-12 rounded-2xl border border-border-strong bg-surface px-4 text-[15px] text-foreground"
        >
          <option value="sa_id">South African ID</option>
          <option value="passport">Passport</option>
          <option value="asylum">Asylum seeker permit</option>
          <option value="refugee">Refugee status document</option>
        </select>
      </label>

      <Field
        label="Document number"
        value={idNumber}
        onChange={setIdNumber}
        placeholder="ID / Passport number"
      />

      <FileField
        label="Upload document photo"
        onFile={(f) => upload(f, "id", setIdPath)}
        done={!!idPath}
        accept="image/*,application/pdf"
      />
      <FileField
        label="Selfie (optional)"
        onFile={(f) => upload(f, "selfie", setSelfiePath)}
        done={!!selfiePath}
        accept="image/*"
      />

      <label className="flex items-start gap-3 text-[13px] text-muted-foreground">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1"
        />
        <span>
          I agree this information is correct. I also agree that CashNear can check it under South
          Africa's privacy law (POPIA).
        </span>
      </label>

      {error ? (
        <p className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" disabled={!canSubmit}>
          {busy ? "Sending…" : "Send my details"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          No, go back
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  helper,
  error,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  helper?: string;
  error?: string | null;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-2xl border border-border-strong bg-surface px-4 text-[15px] text-foreground placeholder:text-muted-foreground/60 focus:border-gold focus:outline-none"
      />
      {error ? (
        <span className="text-[12px] text-destructive" role="alert">
          {error}
        </span>
      ) : helper ? (
        <span className="text-[12px] text-muted-foreground">{helper}</span>
      ) : null}
    </label>
  );
}

function FileField({
  label,
  onFile,
  done,
  accept,
}: {
  label: string;
  onFile: (f: File) => void;
  done: boolean;
  accept?: string;
}) {
  return (
    <label className="flex cursor-pointer flex-col gap-2">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <div
        className={`flex h-14 items-center justify-between rounded-2xl border px-4 text-[14px] ${
          done ? "border-success text-foreground" : "border-border-strong text-muted-foreground"
        }`}
      >
        <span>{done ? "Uploaded ✓" : "Tap to choose a file"}</span>
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {done ? "Replace" : "Upload"}
        </span>
      </div>
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </label>
  );
}
