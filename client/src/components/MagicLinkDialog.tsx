import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Mail, Phone, ArrowRight, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";

type MagicLinkContextType = {
  openDialog: (initialMethod?: "email" | "phone") => void;
  openDealPrompt: (dealUrl: string, dealId?: string) => void;
};

const MagicLinkContext = createContext<MagicLinkContextType>({
  openDialog: () => {},
  openDealPrompt: () => {},
});

export const useMagicLink = () => useContext(MagicLinkContext);

type Step = "input" | "code" | "success";
type LoginMethod = "email" | "phone";

const SMS_LOGIN_ENABLED = import.meta.env.VITE_ENABLE_SMS_LOGIN === "true";

function MagicLinkForm({ onSuccess, initialMethod = "email" }: { onSuccess: () => void; initialMethod?: LoginMethod }) {
  const { toast } = useToast();
  const [method, setMethod] = useState<LoginMethod>(initialMethod);
  const [step, setStep] = useState<Step>("input");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const handleMethodSwitch = (newMethod: LoginMethod) => {
    setMethod(newMethod);
    setStep("input");
    setCode("");
    setDevCode(null);
    setUsePassword(false);
    setPassword("");
  };

  const handlePasswordLogin = async () => {
    if (!email.trim() || !password) return;
    setLoggingIn(true);
    try {
      const res = await fetch("/api/auth/password/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Sign in failed", description: data.message || "Invalid email or password", variant: "destructive" });
        return;
      }
      setStep("success");
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setTimeout(onSuccess, 1200);
    } catch {
      toast({ title: "Error", description: "Something went wrong", variant: "destructive" });
    } finally {
      setLoggingIn(false);
    }
  };

  const handleSendCode = async () => {
    const value = method === "email" ? email.trim() : phone.trim();
    if (!value) return;
    setSending(true);
    try {
      const endpoint = method === "email" ? "/api/auth/magic-link/send" : "/api/auth/sms/send";
      const body = method === "email" ? { email: value } : { phone: value };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.message || "Failed to send code", variant: "destructive" });
        return;
      }
      if (data.code && !(method === "email" ? data.emailSent : data.smsSent)) {
        setDevCode(data.code);
      }
      setStep("code");
    } catch {
      toast({ title: "Error", description: "Something went wrong", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!code.trim()) return;
    setVerifying(true);
    try {
      const endpoint = method === "email" ? "/api/auth/magic-link/verify" : "/api/auth/sms/verify";
      const value = method === "email" ? email.trim() : phone.trim();
      const body = method === "email" ? { email: value, code: code.trim() } : { phone: value, code: code.trim() };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Invalid code", description: data.message || "Please try again", variant: "destructive" });
        return;
      }
      setStep("success");
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setTimeout(onSuccess, 1200);
    } catch {
      toast({ title: "Error", description: "Something went wrong", variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  if (step === "success") {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <div className="text-center">
          <div className="text-lg font-bold">You're in!</div>
          <div className="mt-1 text-sm text-muted-foreground">
            You can now save preferences and get deal alerts.
          </div>
        </div>
      </div>
    );
  }

  if (step === "code") {
    const displayValue = method === "email" ? email : phone;
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-primary/10 bg-primary/5 p-3 text-center">
          <div className="text-sm text-muted-foreground">
            Code sent to
          </div>
          <div className="font-semibold">{displayValue}</div>
        </div>

        {devCode && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 p-3 text-center">
            <div className="text-xs text-amber-600 dark:text-amber-400">
              {method === "email" ? "Email" : "SMS"} not configured — your code is:
            </div>
            <div className="mt-1 text-2xl font-bold tracking-[6px] text-amber-700 dark:text-amber-300">{devCode}</div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="magic-code">Verification code</Label>
          <Input
            id="magic-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="ring-focus rounded-xl text-center text-2xl tracking-[6px] font-bold"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && code.length === 6 && handleVerifyCode()}
            data-testid="input-magic-code"
          />
        </div>

        <Button
          onClick={handleVerifyCode}
          disabled={code.length !== 6 || verifying}
          className="w-full rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20"
          data-testid="button-verify-code"
        >
          {verifying ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...</>
          ) : (
            <>Verify & Sign In</>
          )}
        </Button>

        <button
          type="button"
          onClick={() => { setStep("input"); setCode(""); setDevCode(null); }}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-back-to-input"
        >
          Use a different {method === "email" ? "email" : "phone number"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {SMS_LOGIN_ENABLED && (
        <div className="flex rounded-xl bg-muted p-1 gap-1">
          <button
            type="button"
            onClick={() => handleMethodSwitch("email")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition-all ${
              method === "email"
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-email-login"
          >
            <Mail className="h-3.5 w-3.5" />
            Email
          </button>
          <button
            type="button"
            onClick={() => handleMethodSwitch("phone")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition-all ${
              method === "phone"
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-phone-login"
          >
            <Phone className="h-3.5 w-3.5" />
            Phone
          </button>
        </div>
      )}

      {method === "email" ? (
        <div className="space-y-2">
          <Label htmlFor="magic-email">Email address</Label>
          <Input
            id="magic-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ring-focus rounded-xl"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && email.trim() && (usePassword ? handlePasswordLogin() : handleSendCode())}
            data-testid="input-magic-email"
          />
          {usePassword && (
            <div className="space-y-2 pt-1">
              <Label htmlFor="magic-password">Password</Label>
              <Input
                id="magic-password"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="ring-focus rounded-xl"
                onKeyDown={(e) => e.key === "Enter" && email.trim() && password && handlePasswordLogin()}
                data-testid="input-magic-password"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="magic-phone">Phone number</Label>
          <Input
            id="magic-phone"
            type="tel"
            placeholder="(555) 000-0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="ring-focus rounded-xl"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && phone.trim() && handleSendCode()}
            data-testid="input-magic-phone"
          />
        </div>
      )}

      <Button
        onClick={method === "email" && usePassword ? handlePasswordLogin : handleSendCode}
        disabled={
          method === "email" && usePassword
            ? !email.trim() || !password || loggingIn
            : !(method === "email" ? email.trim() : phone.trim()) || sending
        }
        className="w-full rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20"
        data-testid="button-send-code"
      >
        {method === "email" && usePassword ? (
          loggingIn ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...</>
          ) : (
            <>Sign in<ArrowRight className="ml-2 h-4 w-4" /></>
          )
        ) : sending ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending code...</>
        ) : method === "email" ? (
          <>
            <Mail className="mr-2 h-4 w-4" />
            Send verification code
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        ) : (
          <>
            <Phone className="mr-2 h-4 w-4" />
            Text me a code
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>

      {method === "email" && (
        <button
          type="button"
          onClick={() => { setUsePassword((v) => !v); setPassword(""); }}
          className="w-full text-center text-xs text-primary hover:underline"
          data-testid="button-toggle-password-login"
        >
          {usePassword ? "Use a one-time code instead" : "Sign in with a password instead"}
        </button>
      )}

      {!(method === "email" && usePassword) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          <span>
            {method === "email"
              ? "No password needed. We'll send a one-time code to your email."
              : "No password needed. We'll text a one-time code to your phone."}
          </span>
        </div>
      )}
    </div>
  );
}

function DealPromptContent({
  dealUrl,
  dealId,
  onSkip,
  onSuccess,
}: {
  dealUrl: string;
  dealId?: string;
  onSkip: () => void;
  onSuccess: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2 text-center">
        <div className="text-sm text-muted-foreground">
          Register to save your preferences and get alerted when prices drop on deals like this.
        </div>
      </div>

      <MagicLinkForm onSuccess={onSuccess} />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">or</span>
        </div>
      </div>

      <Button
        variant="ghost"
        onClick={onSkip}
        className="w-full rounded-xl text-muted-foreground hover:text-foreground"
        data-testid="button-skip-registration"
      >
        Continue to deal without registering
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

export function MagicLinkProvider({ children }: { children: ReactNode }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMethod, setDialogMethod] = useState<LoginMethod>("email");
  const [promptOpen, setPromptOpen] = useState(false);
  const [pendingDealUrl, setPendingDealUrl] = useState("");
  const [pendingDealId, setPendingDealId] = useState<string | undefined>();

  const openDialog = useCallback((initialMethod: LoginMethod = "email") => {
    setDialogMethod(initialMethod);
    setDialogOpen(true);
  }, []);

  const openDealPrompt = useCallback((dealUrl: string, dealId?: string) => {
    const dismissed = sessionStorage.getItem("tss-register-dismissed");
    if (dismissed) {
      window.open(dealUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setPendingDealUrl(dealUrl);
    setPendingDealId(dealId);
    setPromptOpen(true);
  }, []);

  const handleSkip = () => {
    sessionStorage.setItem("tss-register-dismissed", "1");
    setPromptOpen(false);
    if (pendingDealUrl) {
      window.open(pendingDealUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handlePromptSuccess = () => {
    setPromptOpen(false);
    if (pendingDealUrl) {
      window.open(pendingDealUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleDialogSuccess = () => {
    setDialogOpen(false);
  };

  return (
    <MagicLinkContext.Provider value={{ openDialog, openDealPrompt }}>
      {children}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-center text-xl">Sign In</DialogTitle>
            <DialogDescription className="text-center">
              Save your preferences and get notified when deals match your interests.
            </DialogDescription>
          </DialogHeader>
          <MagicLinkForm onSuccess={handleDialogSuccess} initialMethod={dialogMethod} />
        </DialogContent>
      </Dialog>

      <Dialog open={promptOpen} onOpenChange={(open) => {
        if (!open) {
          setPromptOpen(false);
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-center text-xl">Want Deal Alerts?</DialogTitle>
          </DialogHeader>
          <DealPromptContent
            dealUrl={pendingDealUrl}
            dealId={pendingDealId}
            onSkip={handleSkip}
            onSuccess={handlePromptSuccess}
          />
        </DialogContent>
      </Dialog>
    </MagicLinkContext.Provider>
  );
}
