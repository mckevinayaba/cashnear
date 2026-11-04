import { Body, Button, Card, CardBody, Eyebrow } from "@/components/ds";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

/**
 * "Put CashNear on your phone." Shown on phones only, never inside the
 * installed app, and not again for two weeks once someone says not now.
 */
export function InstallCard({ alwaysShow = false }: { alwaysShow?: boolean }) {
  const { canPrompt, standalone, dismissed, ios, install, dismiss } = useInstallPrompt();
  if (standalone || (dismissed && !alwaysShow)) return null;

  return (
    <Card variant="outline" className="lg:hidden">
      <CardBody className="flex flex-col gap-3">
        <Eyebrow>On your phone</Eyebrow>
        <p className="font-display text-[24px] leading-[1.1]">Put CashNear on your home screen.</p>
        <Body className="text-[14px] text-muted-foreground">
          {canPrompt
            ? "Open it like any other app, with one tap, and no browser around it."
            : ios
              ? "Tap the Share button at the bottom of Safari, then choose Add to Home Screen."
              : "Open your browser's menu, then choose Add to Home screen."}
        </Body>
        <div className="flex flex-col gap-2">
          {canPrompt ? (
            <Button size="lg" fullWidth onClick={() => void install()}>
              Add to home screen
            </Button>
          ) : null}
          {!alwaysShow ? (
            <Button variant="ghost" fullWidth onClick={dismiss}>
              {canPrompt ? "Not now" : "Got it"}
            </Button>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
