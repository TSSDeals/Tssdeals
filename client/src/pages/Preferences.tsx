import { useEffect, useMemo, useState } from "react";
import Seo from "@/components/Seo";
import { AppShell } from "@/components/AppShell";
import { usePreferences, useUpsertPreferences } from "@/hooks/use-preferences";
import { useEquipmentTypes, useSports } from "@/hooks/use-taxonomy";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { redirectToLogin } from "@/lib/auth-utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BellRing, Eye, EyeOff, Filter, MessageSquare, Save, SlidersHorizontal, Target, TicketX } from "lucide-react";
import { curateShopperEquipmentTypes } from "@shared/equipment-groups";

export default function PreferencesPage() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      redirectToLogin((opts) => toast(opts as any));
    }
  }, [authLoading, isAuthenticated, toast]);

  const prefs = usePreferences();
  const save = useUpsertPreferences();

  const sports = useSports();
  const [sportTab, setSportTab] = useState<string>("all");
  const eq = useEquipmentTypes(sportTab === "all" ? undefined : sportTab);

  const [condition, setCondition] = useState<"all" | "new" | "preowned">("all");
  const [minPercentOff, setMinPercentOff] = useState<number>(50);
  const [pushEnabled, setPushEnabled] = useState<boolean>(false);
  const [equipmentTypeIds, setEquipmentTypeIds] = useState<string[]>([]);
  const [smsEnabled, setSmsEnabled] = useState<boolean>(false);
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [smsConsent, setSmsConsent] = useState<boolean>(false);
  const [defaultSportId, setDefaultSportId] = useState<string>("all");
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const passwordStatus = useQuery<{ hasPassword: boolean }>({
    queryKey: ["/api/auth/password/status"],
    enabled: isAuthenticated,
  });

  const onSavePassword = async () => {
    if (newPassword.length < 8) {
      toast({ title: "Too short", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please re-enter the same password.", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    try {
      await apiRequest("POST", "/api/auth/password/set", { password: newPassword });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/password/status"] });
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Password saved", description: "You can now sign in with your email and password." });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err?.message || "Try again.", variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  };

  const sectionOptions = [
    { key: "featured", label: "Featured Deals" },
    { key: "twin-seam", label: "Twin Seam Sports" },
    { key: "all-other", label: "All Other Deals" },
  ];

  const toggleHiddenSection = (key: string) => {
    setHiddenSections((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  };

  useEffect(() => {
    if (prefs.data) {
      setCondition((prefs.data as any).condition ?? "all");
      setMinPercentOff(Number((prefs.data as any).minPercentOff ?? 50));
      setPushEnabled(Boolean((prefs.data as any).pushEnabled ?? false));
      const smsOn = Boolean((prefs.data as any).smsEnabled ?? false);
      setSmsEnabled(smsOn);
      setPhoneNumber((prefs.data as any).phoneNumber ?? "");
      if (smsOn) setSmsConsent(true);
      setEquipmentTypeIds(((prefs.data as any).equipmentTypeIds ?? []) as string[]);
      setDefaultSportId((prefs.data as any).sportId ?? "all");
      setHiddenSections(((prefs.data as any).hiddenSections ?? []) as string[]);
    }
  }, [prefs.data]);

  const equipmentList = useMemo(
    () => curateShopperEquipmentTypes((eq.data ?? []) as any[], sportTab === "all" ? undefined : sportTab),
    [eq.data, sportTab],
  );
  const selectedCount = equipmentTypeIds.length;

  const toggleEquip = (id: string) => {
    setEquipmentTypeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const setAllForSport = () => {
    const ids = equipmentList.map((t) => String(t.id));
    setEquipmentTypeIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const clearSport = () => {
    const sportIds = new Set(equipmentList.map((t) => String(t.id)));
    setEquipmentTypeIds((prev) => prev.filter((id) => !sportIds.has(id)));
  };

  const onSave = async () => {
    if (smsEnabled && phoneNumber.trim() && !smsConsent) {
      toast({
        title: "SMS consent required",
        description: "Please check the consent box to opt in to SMS notifications.",
        variant: "destructive",
      });
      return;
    }
    try {
      await save.mutateAsync({
        condition,
        minPercentOff,
        pushEnabled,
        smsEnabled,
        phoneNumber: phoneNumber || null,
        equipmentTypeIds,
        sportId: defaultSportId === "all" ? null : defaultSportId,
        hiddenSections,
      });
      toast({ title: "Preferences saved", description: "Your feed and alerts will follow these settings." });
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e?.message ?? "Unknown error", variant: "destructive" });
    }
  };

  return (
    <AppShell
      title="Preferences"
      subtitle="Choose the gear you care about, how deep the discount should be, and whether push alerts are enabled."
      rightSlot={
        <Button
          onClick={onSave}
          disabled={save.isPending}
          className={cn(
            "ring-focus rounded-xl",
            "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground",
            "shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:-translate-y-0.5",
            "active:translate-y-0 active:shadow-md transition-all duration-200 ease-out",
          )}
          data-testid="prefs-save"
        >
          <Save className="mr-2 h-4 w-4" />
          {save.isPending ? "Saving\u2026" : "Save"}
        </Button>
      }
    >
      <Seo title="Preferences \u2014 TwinSeam Deals" description="Set condition, minimum percent-off, equipment types, and push notifications." />

      {prefs.isError ? (
        <EmptyState
          icon={TicketX}
          title="Couldn't load preferences"
          description={(prefs.error as any)?.message ?? "Unknown error"}
          action={
            <Button onClick={() => prefs.refetch()} className="ring-focus rounded-xl" data-testid="prefs-retry">
              Try again
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_420px]">
          <section className="card-elevated animate-float-in p-5 md:p-6" data-testid="prefs-equipment">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl border border-border bg-background/60 shadow-sm">
                    <Filter className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-display text-xl font-bold">Equipment types</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Select what to track. More selections = more notifications and a broader feed.
                    </div>
                  </div>
                </div>

                <Badge className="border-primary/20 bg-primary/10 text-primary" data-testid="prefs-selected-count">
                  {selectedCount} selected
                </Badge>
              </div>

              <div className="flex flex-col gap-4">
                <div className="grid gap-2">
                  <Label>Filter by sport</Label>
                  <Select value={sportTab} onValueChange={setSportTab}>
                    <SelectTrigger className="ring-focus rounded-xl" data-testid="prefs-sport-select">
                      <SelectValue placeholder="All sports" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sports</SelectItem>
                      {(sports.data ?? []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-muted-foreground">
                    {sportTab === "all" ? "Select a sport above to see its equipment types." : "Check the equipment you want to track."}
                  </div>
                  {sportTab !== "all" && (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={setAllForSport}
                        className="ring-focus rounded-xl"
                        data-testid="equip-select-all"
                      >
                        Select all
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={clearSport}
                        className="ring-focus rounded-xl"
                        data-testid="equip-clear-tab"
                      >
                        Clear
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sportTab === "all" ? (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <div className="rounded-2xl border border-border bg-muted/40 p-4">
                        <div className="text-sm font-semibold">Choose a sport</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Select a sport from the dropdown above to see and choose its equipment types.
                        </div>
                      </div>
                    </div>
                  ) : equipmentList.length === 0 ? (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <EmptyState
                        icon={Target}
                        title="No equipment types for this sport"
                        description="No equipment categories have been added for this sport yet."
                      />
                    </div>
                  ) : (
                    equipmentList.map((t: any) => {
                      const checked = equipmentTypeIds.includes(String(t.id));
                      return (
                        <label
                          key={t.id}
                          className={cn(
                            "group flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-all duration-200",
                            "hover:bg-muted/60 hover:shadow-sm",
                            checked ? "border-primary/20 bg-primary/10" : "border-border bg-background/60",
                          )}
                          data-testid={`equip-${t.id}`}
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggleEquip(String(t.id))} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold">{t.name}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Included in feed & notifications
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="card-elevated animate-float-in stagger-2 p-5 md:p-6" data-testid="prefs-core">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/75 shadow-lg shadow-primary/20">
                <SlidersHorizontal className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">Deal rules</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  These settings tune what counts as "hot" for you.
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="grid gap-2">
                <Label>Condition</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={condition === "all" ? "default" : "secondary"}
                    onClick={() => setCondition("all")}
                    className="ring-focus rounded-xl"
                    data-testid="prefs-condition-all"
                  >
                    All
                  </Button>
                  <Button
                    type="button"
                    variant={condition === "new" ? "default" : "secondary"}
                    onClick={() => setCondition("new")}
                    className="ring-focus rounded-xl"
                    data-testid="prefs-condition-new"
                  >
                    New
                  </Button>
                  <Button
                    type="button"
                    variant={condition === "preowned" ? "default" : "secondary"}
                    onClick={() => setCondition("preowned")}
                    className="ring-focus rounded-xl"
                    data-testid="prefs-condition-preowned"
                  >
                    Preowned
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Minimum percent off</Label>
                <div className="rounded-2xl border border-border bg-background/60 px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold" data-testid="prefs-minoff-value">{minPercentOff}%</div>
                    <div className="text-xs text-muted-foreground">Higher = fewer, hotter deals</div>
                  </div>
                  <Slider
                    value={[minPercentOff]}
                    onValueChange={(v) => setMinPercentOff(v[0] ?? 50)}
                    min={0}
                    max={100}
                    step={1}
                    className="mt-2"
                    data-testid="prefs-minoff"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-border bg-gradient-to-br from-accent/10 to-primary/10 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl border border-border bg-background/60 shadow-sm">
                    <BellRing className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <div className="text-sm font-bold">Push enabled</div>
                    <div className="text-xs text-muted-foreground">
                      You still need to subscribe in Notifications.
                    </div>
                  </div>
                </div>
                <Switch
                  checked={pushEnabled}
                  onCheckedChange={(v) => setPushEnabled(Boolean(v))}
                  data-testid="prefs-pushEnabled"
                />
              </div>

              <div className="rounded-2xl border border-border bg-gradient-to-br from-accent/10 to-primary/10 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-2xl border border-border bg-background/60 shadow-sm">
                      <MessageSquare className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <div className="text-sm font-bold">SMS alerts</div>
                      <div className="text-xs text-muted-foreground">
                        Get text messages when price alerts trigger.
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={smsEnabled}
                    onCheckedChange={(v) => {
                      const on = Boolean(v);
                      setSmsEnabled(on);
                      if (!on) setSmsConsent(false);
                    }}
                    data-testid="prefs-smsEnabled"
                  />
                </div>
                <div className="mt-3 space-y-3">
                  <div>
                    <Label className="text-xs">Phone number</Label>
                    <Input
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="mt-1 rounded-xl"
                      data-testid="prefs-phoneNumber"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Add your mobile number so we can text you deal alerts. Turn on <strong>SMS alerts</strong> above and check the consent box to start receiving texts.
                    </p>
                  </div>
                  {smsEnabled && (
                    <>
                      <label className="flex items-start gap-2 cursor-pointer" data-testid="prefs-smsConsent">
                        <Checkbox
                          checked={smsConsent}
                          onCheckedChange={(v) => setSmsConsent(Boolean(v))}
                          className="mt-0.5"
                        />
                        <span className="text-xs leading-relaxed text-muted-foreground">
                          I agree to receive recurring automated promotional and deal alert text messages from TSSDeals at the phone number provided. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to unsubscribe. Reply HELP for help. Consent is not a condition of purchase. View our{" "}
                          <a href="/privacy" className="underline text-primary" target="_blank">Privacy Policy</a>{" "}and{" "}
                          <a href="/terms" className="underline text-primary" target="_blank">Terms of Service</a>.
                        </span>
                      </label>
                      <div className="text-xs text-muted-foreground">
                        US numbers only. Texts come from (934) CALL-TSS (934-225-5877). Standard messaging rates apply.
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Default sport filter</Label>
                <Select value={defaultSportId} onValueChange={setDefaultSportId}>
                  <SelectTrigger className="ring-focus rounded-xl" data-testid="prefs-default-sport">
                    <SelectValue placeholder="All sports" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sports</SelectItem>
                    {(sports.data ?? []).map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground">
                  The deals page will start with this sport pre-selected.
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Sections to show on deals page</Label>
                <div className="grid gap-2">
                  {sectionOptions.map((opt) => {
                    const isHidden = hiddenSections.includes(opt.key);
                    return (
                      <label
                        key={opt.key}
                        className={cn(
                          "flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-3 transition-all duration-200",
                          isHidden ? "border-border bg-muted/40 opacity-60" : "border-primary/20 bg-primary/5",
                        )}
                        data-testid={`prefs-section-${opt.key}`}
                      >
                        <div className="flex items-center gap-3">
                          {isHidden ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-primary" />}
                          <span className="text-sm font-medium">{opt.label}</span>
                        </div>
                        <Switch
                          checked={!isHidden}
                          onCheckedChange={() => toggleHiddenSection(opt.key)}
                        />
                      </label>
                    );
                  })}
                </div>
                <div className="text-xs text-muted-foreground">
                  Hidden sections won't appear on your deals page.
                </div>
              </div>

              <Button
                onClick={onSave}
                disabled={save.isPending}
                className={cn(
                  "ring-focus rounded-xl",
                  "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground",
                  "shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:-translate-y-0.5",
                  "active:translate-y-0 active:shadow-md transition-all duration-200 ease-out",
                )}
                data-testid="prefs-save-secondary"
              >
                <Save className="mr-2 h-4 w-4" />
                {save.isPending ? "Saving\u2026" : "Save preferences"}
              </Button>

              <div className="rounded-2xl border border-border p-4 space-y-3" data-testid="prefs-password">
                <div className="flex items-center gap-2">
                  <BellRing className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">
                    {passwordStatus.data?.hasPassword ? "Change password" : "Set a password (optional)"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  You can always sign in with a one-time code. Adding a password lets you sign in with just your email and password.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="pref-new-password">New password</Label>
                  <Input
                    id="pref-new-password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="rounded-xl"
                    data-testid="input-new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pref-confirm-password">Confirm password</Label>
                  <Input
                    id="pref-confirm-password"
                    type="password"
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="rounded-xl"
                    data-testid="input-confirm-password"
                  />
                </div>
                <Button
                  onClick={onSavePassword}
                  disabled={savingPassword || !newPassword || !confirmPassword}
                  variant="outline"
                  className="rounded-xl"
                  data-testid="button-save-password"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {savingPassword ? "Saving\u2026" : passwordStatus.data?.hasPassword ? "Update password" : "Set password"}
                </Button>
              </div>

              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <div className="text-xs font-semibold text-muted-foreground">Heads up</div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Discount calculations come from the aggregator. MSRP isn't always available; when it is, we show it on the deal card.
                  Push notifications require HTTPS + service worker support. SMS alerts are sent when your price alerts trigger and require a valid US phone number.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
