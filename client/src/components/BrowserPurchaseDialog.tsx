import { useState } from "react";
import { Check, Copy, ExternalLink, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function BrowserPurchaseDialog({
  open,
  onOpenChange,
  merchantName,
  purchaseUrl,
  onContinue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  merchantName: string;
  purchaseUrl: string;
  onContinue: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyPurchaseLink = async () => {
    try {
      await navigator.clipboard.writeText(purchaseUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="browser-purchase-dialog">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Smartphone className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center">Complete your purchase in your browser</DialogTitle>
          <DialogDescription className="text-center">
            The {merchantName} app may open automatically on mobile. Staying in your browser helps
            ensure this deal and referral are tracked correctly.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Button
            onClick={onContinue}
            className="min-h-11 w-full rounded-xl"
            data-testid="browser-purchase-continue"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Continue in Browser
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={copyPurchaseLink}
            className="min-h-11 w-full rounded-xl"
            data-testid="browser-purchase-copy"
          >
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? "Purchase link copied" : "Copy Purchase Link"}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          If the app opens, return here and paste the copied link into Safari or Chrome.
        </p>
      </DialogContent>
    </Dialog>
  );
}
