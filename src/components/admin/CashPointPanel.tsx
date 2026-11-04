import { useCallback, useEffect, useState } from "react";
import { Body, Button, Card, CardBody, Eyebrow, Muted } from "@/components/ds";
import { ConfirmActionDialog } from "@/components/admin/ConfirmActionDialog";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ShopfrontPhoto } from "@/components/cash/ShopfrontPhoto";
import { supabase } from "@/integrations/supabase/client";
import { describeCashError, formatRand } from "@/lib/cash";
import { removeShopfrontFile, uploadShopfront } from "@/lib/shopfront";
import type { Database } from "@/integrations/supabase/types";

type CashPoint = Database["public"]["Tables"]["cash_points"]["Row"];

/**
 * Enrols an approved shop in the cash-holds pilot. Enrolment needs the shop's
 * coordinates (set by a person who has visited it), which is why this is an
 * ops action and not something a shop can do for itself.
 */
export function CashPointPanel({
  businessId,
  approved,
}: {
  businessId: string;
  approved: boolean;
}) {
  const [point, setPoint] = useState<CashPoint | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [area, setArea] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [landmark, setLandmark] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [frontMessage, setFrontMessage] = useState<string | null>(null);
  const [frontError, setFrontError] = useState<string | null>(null);
  const [savingFront, setSavingFront] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("cash_points")
      .select("*")
      .eq("business_id", businessId)
      .maybeSingle();
    setPoint(data);
    if (data) {
      setLat(data.latitude?.toString() ?? "");
      setLng(data.longitude?.toString() ?? "");
      setArea(data.area ?? "");
      setLandmark(data.landmark ?? "");
    }
    setLoaded(true);
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (enrolled: boolean) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const latN = Number(lat);
      const lngN = Number(lng);
      if (enrolled && (!lat.trim() || !lng.trim() || Number.isNaN(latN) || Number.isNaN(lngN))) {
        throw new Error(
          "Enter the shop's latitude and longitude, for example -26.2405 and 27.9055.",
        );
      }
      const { error: rpcError } = await supabase.rpc("cash_enrol_point", {
        p_business: businessId,
        p_lat: latN,
        p_lng: lngN,
        p_area: area.trim(),
        p_enrolled: enrolled,
      });
      if (rpcError) throw new Error(describeCashError(rpcError.message));
      setMessage(enrolled ? "Shop enrolled in cash holds." : "Shop removed from cash holds.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveFront = async () => {
    setSavingFront(true);
    setFrontError(null);
    setFrontMessage(null);
    try {
      const previous = point?.photo_path ?? null;
      const nextPath = photo ? await uploadShopfront(businessId, photo) : previous;
      const { error: rpcError } = await supabase.rpc("cash_set_shopfront", {
        p_business: businessId,
        p_landmark: landmark.trim(),
        p_photo_path: nextPath as string,
      });
      if (rpcError) {
        // The file was never attached to the shop, so do not leave it behind.
        if (photo) await removeShopfrontFile(nextPath);
        throw new Error(describeCashError(rpcError.message));
      }
      if (photo) await removeShopfrontFile(previous);
      setPhoto(null);
      setFrontMessage("Shop front saved. Customers will now see it.");
      await load();
    } catch (e) {
      setFrontError((e as Error).message);
    } finally {
      setSavingFront(false);
    }
  };

  if (!approved) return null;

  return (
    <section>
      <Eyebrow>Cash holds pilot</Eyebrow>
      <Card variant="outline" className="mt-3">
        <CardBody className="flex flex-col gap-4">
          {!loaded ? (
            <Muted>Loading…</Muted>
          ) : (
            <>
              {point ? (
                <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
                  <StatusBadge
                    label={point.enrolled ? "Enrolled" : "Not enrolled"}
                    tone={point.enrolled ? "success" : "muted"}
                  />
                  <span>{point.online ? "Online now" : "Offline"}</span>
                  <span>Offers up to {formatRand(point.cash_band_cents)}</span>
                  <span>Trust {point.trust_score}</span>
                  {point.paused_reason ? (
                    <StatusBadge label={point.paused_reason} tone="warn" />
                  ) : null}
                </div>
              ) : (
                <Body className="text-[14px] text-muted-foreground">
                  Not enrolled. Visit the shop, then add its location to enrol it.
                </Body>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] text-muted-foreground">Latitude</span>
                  <input
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    inputMode="decimal"
                    placeholder="-26.2405"
                    className="h-11 rounded-xl border border-border-strong bg-transparent px-3 text-[14px]"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] text-muted-foreground">Longitude</span>
                  <input
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    inputMode="decimal"
                    placeholder="27.9055"
                    className="h-11 rounded-xl border border-border-strong bg-transparent px-3 text-[14px]"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] text-muted-foreground">Area</span>
                <input
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  maxLength={80}
                  className="h-11 rounded-xl border border-border-strong bg-transparent px-3 text-[14px]"
                />
              </label>

              {error ? (
                <p role="alert" className="text-[13px] text-destructive">
                  {error}
                </p>
              ) : null}
              {message ? <p className="text-[13px] text-success">{message}</p> : null}

              <div className="flex flex-wrap gap-3">
                <Button disabled={busy} onClick={() => save(true)}>
                  {point?.enrolled ? "Update location" : "Enrol shop"}
                </Button>
                {point?.enrolled ? (
                  <Button variant="secondary" disabled={busy} onClick={() => save(false)}>
                    Remove from pilot
                  </Button>
                ) : null}
                {point?.paused_reason ? (
                  <Button variant="secondary" disabled={busy} onClick={() => setClearing(true)}>
                    Clear pause
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {point ? (
        <Card variant="outline" className="mt-4">
          <CardBody className="flex flex-col gap-4">
            <div>
              <Eyebrow>Shop front</Eyebrow>
              <Body className="mt-1 text-[14px] text-muted-foreground">
                Take this when you visit. Customers see the photo and the landmark before they walk
                over, so stand where a customer would first see the shop.
              </Body>
            </div>

            <ShopfrontPhoto path={point.photo_path} name="this shop" />

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-muted-foreground">
                Landmark, in the words people use
              </span>
              <input
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                maxLength={120}
                placeholder="Next to the clinic"
                className="h-11 rounded-xl border border-border-strong bg-transparent px-3 text-[14px]"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-muted-foreground">
                {point.photo_path ? "Replace the photo" : "Photo of the shop front"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                className="text-[13px] text-muted-foreground file:mr-3 file:rounded-full file:border file:border-border-strong file:bg-transparent file:px-4 file:py-2 file:text-[13px] file:text-foreground"
              />
            </label>

            {frontError ? (
              <p role="alert" className="text-[13px] text-destructive">
                {frontError}
              </p>
            ) : null}
            {frontMessage ? <p className="text-[13px] text-success">{frontMessage}</p> : null}

            <div>
              <Button disabled={savingFront} onClick={saveFront}>
                {savingFront ? "Saving…" : "Save shop front"}
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <ConfirmActionDialog
        open={clearing}
        onOpenChange={setClearing}
        title="Clear this shop's pause?"
        description="Only do this after the report has been reviewed. The shop can then go online again."
        confirmLabel="Clear pause"
        requireReason
        reasonLabel="What did you check?"
        onConfirm={async (reason) => {
          const { error: rpcError } = await supabase.rpc("cash_clear_pause", {
            p_business: businessId,
            p_note: reason,
          });
          if (rpcError) throw new Error(describeCashError(rpcError.message));
        }}
        onSuccess={() => void load()}
      />
    </section>
  );
}
