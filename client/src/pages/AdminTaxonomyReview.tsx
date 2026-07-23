import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Download,
  FileJson,
  Loader2,
  Pause,
  Shield,
  Upload,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import Seo from "@/components/Seo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { redirectToLogin } from "@/lib/auth-utils";
import { useToast } from "@/hooks/use-toast";
import {
  createTaxonomyReviewDecision,
  defaultReviewFilters,
  filterReviewQueue,
  hasTaxonomyReviewAdminAccess,
  importTaxonomyReviewPacket,
  sha256AuditBundle,
  taxonomyReviewDecisionsCsv,
  taxonomyReviewDecisionsJson,
  type ReviewClassification,
  type ReviewDecisionValue,
  type ReviewFilters,
  type ReviewQueueItem,
  type ReviewQueueKind,
  type TaxonomyReviewDecision,
  type TaxonomyReviewWorkspace,
} from "@shared/taxonomy-review";

const PAGE_SIZE = 50;

function classificationLabel(value: ReviewClassification): string {
  return `${value.sportId ?? "Unclassified"} / ${value.equipmentTypeId ?? "Unresolved"}`;
}

function downloadText(filename: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function filterOptions(items: ReviewQueueItem[]) {
  const sorted = (values: string[]) => Array.from(new Set(values)).sort();
  return {
    sources: sorted(items.flatMap((item) => item.sourceIds)),
    current: sorted(items.flatMap((item) =>
      item.currentClassifications.map((value) =>
        `${value.sportId ?? "null"}/${value.equipmentTypeId ?? "null"}`))),
    proposed: sorted(items.map((item) =>
      `${item.proposedClassification.sportId ?? "null"}/${item.proposedClassification.equipmentTypeId ?? "null"}`)),
  };
}

function QueueFilters({
  filters,
  items,
  onChange,
}: {
  filters: ReviewFilters;
  items: ReviewQueueItem[];
  onChange: (filters: ReviewFilters) => void;
}) {
  const options = useMemo(() => filterOptions(items), [items]);
  const set = <K extends keyof ReviewFilters>(key: K, value: ReviewFilters[K]) =>
    onChange({ ...filters, [key]: value });
  return (
    <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-3 xl:grid-cols-6">
      <FilterSelect label="Priority" value={filters.priority}
        onChange={(value) => set("priority", value as ReviewFilters["priority"])}
        options={["critical", "high", "medium", "low"]} />
      <FilterSelect label="Source" value={filters.source}
        onChange={(value) => set("source", value)} options={options.sources} />
      <FilterSelect label="Current classification" value={filters.currentClassification}
        onChange={(value) => set("currentClassification", value)} options={options.current} />
      <FilterSelect label="Proposed destination" value={filters.proposedDestination}
        onChange={(value) => set("proposedDestination", value)} options={options.proposed} />
      <FilterSelect label="Availability" value={filters.availability}
        onChange={(value) => set("availability", value as ReviewFilters["availability"])}
        options={["available", "unavailable", "unknown"]} />
      <FilterSelect label="Review status" value={filters.reviewStatus}
        onChange={(value) => set("reviewStatus", value as ReviewFilters["reviewStatus"])}
        options={["undecided", "approve", "reject", "defer"]} />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>{option}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DecisionButtons({
  item,
  decision,
  note,
  onNote,
  onDecide,
}: {
  item: ReviewQueueItem;
  decision: TaxonomyReviewDecision | undefined;
  note: string;
  onNote: (value: string) => void;
  onDecide: (decision: ReviewDecisionValue) => void;
}) {
  return (
    <div className="min-w-[230px] space-y-2">
      <Input
        value={note}
        onChange={(event) => onNote(event.target.value)}
        placeholder="Optional reviewer note"
        aria-label={`Reviewer note for ${item.key}`}
      />
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant={decision?.decision === "approve" ? "default" : "outline"}
          onClick={() => onDecide("approve")}>
          <Check className="mr-1 h-3.5 w-3.5" /> Approve
        </Button>
        <Button size="sm" variant={decision?.decision === "reject" ? "destructive" : "outline"}
          onClick={() => onDecide("reject")}>
          <X className="mr-1 h-3.5 w-3.5" /> Reject
        </Button>
        <Button size="sm" variant="outline" onClick={() => onDecide("defer")}
          className={decision?.decision === "defer" ? "border-amber-500 bg-amber-500/10" : ""}>
          <Pause className="mr-1 h-3.5 w-3.5" /> Defer
        </Button>
      </div>
      {decision && (
        <div className="text-xs text-muted-foreground">
          Current decision: <span className="font-semibold">{decision.decision}</span>
        </div>
      )}
    </div>
  );
}

export default function AdminTaxonomyReview() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const isAdmin = hasTaxonomyReviewAdminAccess(user);
  const [workspace, setWorkspace] = useState<TaxonomyReviewWorkspace | null>(null);
  const [decisions, setDecisions] = useState<Map<string, TaxonomyReviewDecision>>(new Map());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<ReviewFilters>(defaultReviewFilters());
  const [queueKind, setQueueKind] = useState<ReviewQueueKind>("taxonomy-correction");
  const [page, setPage] = useState(0);
  const [loadingFile, setLoadingFile] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      redirectToLogin((options) => toast(options as any));
    }
  }, [isAuthenticated, isLoading, toast]);

  const queueItems = useMemo(() => (workspace?.queueItems ?? [])
    .filter((item) => item.kind === queueKind)
    .sort((a, b) => b.priority.score - a.priority.score || a.key.localeCompare(b.key)),
  [queueKind, workspace]);
  const filteredItems = useMemo(
    () => filterReviewQueue(queueItems, decisions, filters),
    [queueItems, decisions, filters],
  );
  const visibleItems = filteredItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const reviewer = (user as any)?.email ?? (user as any)?.id ?? "admin";

  useEffect(() => setPage(0), [filters, queueKind]);

  if (isLoading) {
    return (
      <AppShell title="Taxonomy Review">
        <div className="flex min-h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <AppShell title="Sign in required">
        <Seo title="Sign in required | TwinSeam Deals" noindex />
        <EmptyState icon={Shield} title="Admin sign-in required"
          description="Sign in with an administrator account to access taxonomy review." />
      </AppShell>
    );
  }

  if (isAuthenticated && !isAdmin) {
    return (
      <AppShell title="Access Denied">
        <Seo title="Access Denied | TwinSeam Deals" noindex />
        <EmptyState icon={Shield} title="Admin Access Only"
          description="This local taxonomy review workflow is restricted to administrators." />
      </AppShell>
    );
  }

  const importPacket = async (file: File) => {
    setLoadingFile(true);
    try {
      const jsonText = await file.text();
      const identity = await sha256AuditBundle(jsonText);
      const nextWorkspace = importTaxonomyReviewPacket(jsonText, identity);
      setWorkspace(nextWorkspace);
      setDecisions(new Map());
      setNotes({});
      setFilters(defaultReviewFilters());
      setQueueKind("taxonomy-correction");
      toast({
        title: "Read-only packet loaded",
        description: `${nextWorkspace.counts.proposedCorrections} corrections and ${nextWorkspace.counts.supportedIdentifierRecommendations} supported identifier recommendations are available for review.`,
      });
    } catch (error: any) {
      toast({
        title: "Packet rejected",
        description: error?.message ?? "Unable to read the review packet.",
        variant: "destructive",
      });
    } finally {
      setLoadingFile(false);
    }
  };

  const decide = (item: ReviewQueueItem, value: ReviewDecisionValue) => {
    if (!workspace) return;
    const decision = createTaxonomyReviewDecision(workspace, {
      itemKey: item.key,
      decision: value,
      reviewer,
      reviewedAt: new Date().toISOString(),
      reviewerNote: notes[item.key],
    });
    setDecisions((current) => {
      const next = new Map(current);
      next.set(item.key, decision);
      return next;
    });
  };

  const exportDecisions = (format: "json" | "csv") => {
    if (!workspace) return;
    const rows = Array.from(decisions.values());
    const suffix = workspace.auditBundleIdentity.slice("sha256:".length, "sha256:".length + 12);
    if (format === "json") {
      downloadText(
        `taxonomy-review-decisions-${suffix}.json`,
        taxonomyReviewDecisionsJson(workspace, rows),
        "application/json;charset=utf-8",
      );
    } else {
      downloadText(
        `taxonomy-review-decisions-${suffix}.csv`,
        taxonomyReviewDecisionsCsv(workspace, rows),
        "text/csv;charset=utf-8",
      );
    }
  };

  return (
    <AppShell
      title="Taxonomy Review"
      subtitle="Admin-only, local review of a read-only Phase 1.5 packet."
      rightSlot={(
        <Link href="/app/admin">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Admin
          </Button>
        </Link>
      )}
    >
      <Seo title="Taxonomy Review — TwinSeam Deals" noindex />
      <div className="space-y-5">
        <section className="card-elevated space-y-4 p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl space-y-2">
              <div className="flex items-center gap-2">
                <FileJson className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-bold">Load review packet</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Select <code>taxonomy-review-packet.json</code> from a Phase 1.5 audit bundle.
                The file is read locally in this browser. It is not uploaded or stored in the
                production database.
              </p>
            </div>
            <Label className="inline-flex cursor-pointer items-center">
              <Input className="sr-only" type="file" accept=".json,application/json"
                disabled={loadingFile}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importPacket(file);
                  event.currentTarget.value = "";
                }} />
              <span className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
                {loadingFile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Upload className="mr-2 h-4 w-4" />}
                {loadingFile ? "Validating…" : "Choose packet"}
              </span>
            </Label>
          </div>
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <strong>Priority is not confidence or approval.</strong> “Critical” only moves
                shopper-visible, high-impact records earlier in the review order. Every item
                still requires an explicit human decision.
              </div>
            </div>
          </div>
        </section>

        {!workspace ? (
          <EmptyState icon={FileJson} title="No packet loaded"
            description="Load the read-only Phase 1.5 review packet to begin. No production connection is used." />
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard label="Proposed corrections"
                value={workspace.counts.proposedCorrections} />
              <SummaryCard label="Supported identifiers"
                value={workspace.counts.supportedIdentifierRecommendations} />
              <SummaryCard label="Unresolved (read-only)"
                value={workspace.counts.unresolvedManualReview} muted />
              <SummaryCard label="Identifier quarantine"
                value={workspace.counts.identifierQuarantine} muted />
              <SummaryCard label="Decisions in memory" value={decisions.size} />
            </section>

            <section className="card-elevated space-y-4 p-5 md:p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="font-display text-xl font-bold">Approval queue</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Rule {workspace.ruleVersion} · {workspace.auditBundleIdentity.slice(0, 23)}…
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={decisions.size === 0}
                    onClick={() => exportDecisions("json")}>
                    <Download className="mr-1.5 h-4 w-4" /> JSON
                  </Button>
                  <Button variant="outline" disabled={decisions.size === 0}
                    onClick={() => exportDecisions("csv")}>
                    <Download className="mr-1.5 h-4 w-4" /> CSV
                  </Button>
                </div>
              </div>

              <Tabs value={queueKind}
                onValueChange={(value) => setQueueKind(value as ReviewQueueKind)}>
                <TabsList>
                  <TabsTrigger value="taxonomy-correction">
                    Corrections ({workspace.counts.proposedCorrections})
                  </TabsTrigger>
                  <TabsTrigger value="identifier-recommendation">
                    Supported identifiers ({workspace.counts.supportedIdentifierRecommendations})
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <QueueFilters filters={filters} items={queueItems} onChange={setFilters} />

              <div className="text-sm text-muted-foreground">
                Showing {visibleItems.length} of {filteredItems.length} matching items. Quarantined
                identifiers and unresolved/manual records are intentionally unavailable here.
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product / identity</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>Proposed</TableHead>
                    <TableHead>Review signals</TableHead>
                    <TableHead>Decision</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell className="max-w-[360px] align-top">
                        <div className="font-medium">{item.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.sourceNames.join(", ")}
                          {item.sellers.length > 0 ? ` · ${item.sellers.join(", ")}` : ""}
                        </div>
                        {item.kind === "identifier-recommendation" && (
                          <div className="mt-2 text-xs">
                            {item.representativeTitles.slice(0, 3).map((title) => (
                              <div key={title} className="truncate">• {title}</div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        {item.currentClassifications.map((value) => (
                          <div key={classificationLabel(value)}
                            className="mb-1 rounded bg-muted px-2 py-1 text-xs">
                            {classificationLabel(value)}
                          </div>
                        ))}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="rounded bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                          {classificationLabel(item.proposedClassification)}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[210px] align-top">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline">Priority: {item.priority.level}</Badge>
                          <Badge variant="secondary">Confidence: {item.confidence}</Badge>
                          <Badge variant="outline">{item.availability}</Badge>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">{item.reason}</div>
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer font-medium">Evidence</summary>
                          <ul className="mt-1 space-y-1 pl-4">
                            {item.evidence.map((evidence) => (
                              <li key={evidence} className="list-disc">{evidence}</li>
                            ))}
                            {item.negativeEvidence.map((evidence) => (
                              <li key={`negative:${evidence}`} className="list-disc text-amber-700">
                                Negative: {evidence}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </TableCell>
                      <TableCell className="align-top">
                        <DecisionButtons item={item} decision={decisions.get(item.key)}
                          note={notes[item.key] ?? ""}
                          onNote={(value) => setNotes((current) => ({
                            ...current,
                            [item.key]: value,
                          }))}
                          onDecide={(value) => decide(item, value)} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {visibleItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                        No review items match these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between">
                <Button variant="outline" disabled={page === 0}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}>
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page + 1} of {pageCount}
                </span>
                <Button variant="outline" disabled={page + 1 >= pageCount}
                  onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>
                  Next
                </Button>
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function SummaryCard({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${muted ? "bg-muted/30" : "card-elevated"}`}>
      <div className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
