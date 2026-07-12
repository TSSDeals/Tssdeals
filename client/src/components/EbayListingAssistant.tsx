import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Camera, Sparkles, Loader2, X, Upload, Send, Edit, Package, DollarSign, Tag, CheckCircle2, AlertCircle } from "lucide-react";

interface GeneratedListing {
  title: string;
  description: string;
  suggestedPrice: number;
  category: string;
  conditionId: string;
  conditionLabel: string;
  itemSpecifics: Record<string, string>;
}

const SPORTS = [
  "Baseball", "Fastpitch Softball", "Slowpitch Softball", "Basketball",
  "Football", "Soccer", "Golf", "Lacrosse", "Hockey", "Fishing",
  "Volleyball", "Wrestling", "Cycling", "Gymnastics", "Cheerleading",
  "Rugby", "Swimming", "Running",
];

const CONDITIONS = [
  { id: "1000", label: "New" },
  { id: "1500", label: "New Other" },
  { id: "2500", label: "Refurbished" },
  { id: "3000", label: "Used" },
  { id: "7000", label: "For Parts" },
];

export default function EbayListingAssistant() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"input" | "review" | "result">("input");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [sport, setSport] = useState("");
  const [condition, setCondition] = useState("");
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [generated, setGenerated] = useState<GeneratedListing | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editConditionId, setEditConditionId] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSpecifics, setEditSpecifics] = useState<Record<string, string>>({});
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);

  const [result, setResult] = useState<{ success: boolean; sku?: string; offerId?: string; listingId?: string; error?: string } | null>(null);

  const handlePhotosSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + photos.length > 12) {
      toast({ title: "Maximum 12 photos", variant: "destructive" });
      return;
    }
    const newPhotos = [...photos, ...files];
    setPhotos(newPhotos);

    const newPreviews = files.map((f) => URL.createObjectURL(f));
    setPhotoPreviewUrls([...photoPreviewUrls, ...newPreviews]);
  };

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(photoPreviewUrls[index]);
    setPhotos(photos.filter((_, i) => i !== index));
    setPhotoPreviewUrls(photoPreviewUrls.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (!description.trim()) {
      toast({ title: "Please enter a description", variant: "destructive" });
      return;
    }

    setGenerating(true);
    try {
      let imageUrls: string[] = [];

      if (photos.length > 0) {
        const formData = new FormData();
        photos.forEach((file) => formData.append("photos", file));

        const uploadRes = await fetch("/api/ebay-listing/upload-photos", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!uploadRes.ok) {
          throw new Error("Failed to upload photos");
        }

        const uploadData = await uploadRes.json();
        imageUrls = uploadData.imageUrls || [];
        setUploadedImageUrls(imageUrls);
      }

      const generateRes = await apiRequest("POST", "/api/ebay-listing/generate", {
        description: description.trim(),
        imageUrls,
        sport: sport || undefined,
        condition: condition || undefined,
      });

      const listing = await generateRes.json();
      setGenerated(listing);
      setEditTitle(listing.title || "");
      setEditDescription(listing.description || "");
      setEditPrice(String(listing.suggestedPrice || ""));
      setEditConditionId(listing.conditionId || "3000");
      setEditCategory(listing.category || "");
      setEditSpecifics(listing.itemSpecifics || {});
      setStep("review");
    } catch (err: any) {
      toast({ title: "Generation failed", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateListing = async () => {
    setCreating(true);
    try {
      const res = await apiRequest("POST", "/api/ebay-listing/create", {
        title: editTitle,
        description: editDescription,
        price: editPrice,
        conditionId: editConditionId,
        categoryName: editCategory,
        imageUrls: uploadedImageUrls,
        itemSpecifics: editSpecifics,
        quantity: 1,
      });

      const data = await res.json();
      setResult(data);
      setStep("result");
    } catch (err: any) {
      toast({ title: "Listing creation failed", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handlePublish = async () => {
    if (!result?.offerId) return;
    setPublishing(true);
    try {
      const res = await apiRequest("POST", "/api/ebay-listing/publish", {
        offerId: result.offerId,
      });
      const data = await res.json();
      if (data.success) {
        setResult({ ...result, listingId: data.listingId });
        toast({ title: "Listing published on eBay!" });
      } else {
        toast({ title: "Publish failed", description: data.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Publish failed", description: err?.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const resetForm = () => {
    setStep("input");
    setPhotos([]);
    photoPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    setPhotoPreviewUrls([]);
    setDescription("");
    setSport("");
    setCondition("");
    setGenerated(null);
    setUploadedImageUrls([]);
    setResult(null);
  };

  const updateSpecific = (key: string, value: string) => {
    setEditSpecifics((prev) => ({ ...prev, [key]: value }));
  };

  const removeSpecific = (key: string) => {
    setEditSpecifics((prev) => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const addSpecific = () => {
    const key = `Specific ${Object.keys(editSpecifics).length + 1}`;
    setEditSpecifics((prev) => ({ ...prev, [key]: "" }));
  };

  return (
    <div className="space-y-6" data-testid="ebay-listing-assistant">
      {step === "input" && (
        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium mb-2 block">Photos (up to 12)</label>
            <div className="flex flex-wrap gap-3">
              {photoPreviewUrls.map((url, i) => (
                <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-border" data-testid={`photo-preview-${i}`}>
                  <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80"
                    data-testid={`remove-photo-${i}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {photos.length < 12 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-24 h-24 rounded-xl border-2 border-dashed border-border hover:border-primary flex flex-col items-center justify-center gap-1 transition-colors"
                  data-testid="add-photo-button"
                >
                  <Camera className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Add</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotosSelected}
              data-testid="photo-file-input"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Description</label>
            <Textarea
              placeholder="Describe your item... (e.g., Rawlings Heart of the Hide 11.75 infield glove, used, great condition, barely broken in)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="rounded-xl"
              data-testid="listing-description-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Sport (optional)</label>
              <Select value={sport} onValueChange={setSport}>
                <SelectTrigger className="rounded-xl" data-testid="listing-sport-select">
                  <SelectValue placeholder="Select sport" />
                </SelectTrigger>
                <SelectContent>
                  {SPORTS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Condition (optional)</label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger className="rounded-xl" data-testid="listing-condition-select">
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c.id} value={c.label}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating || !description.trim()}
            className="w-full rounded-xl"
            data-testid="generate-listing-button"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                AI is analyzing your item...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate eBay Listing with AI
              </>
            )}
          </Button>
        </div>
      )}

      {step === "review" && generated && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold flex items-center gap-2">
              <Edit className="h-4 w-4" />
              Review & Edit Listing
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setStep("input")} data-testid="back-to-input-button">
              Back
            </Button>
          </div>

          {photoPreviewUrls.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {photoPreviewUrls.map((url, i) => (
                <img key={i} src={url} alt={`Photo ${i + 1}`} className="w-20 h-20 rounded-lg object-cover flex-shrink-0 border border-border" />
              ))}
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              Title
            </label>
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              maxLength={80}
              className="rounded-xl"
              data-testid="edit-title-input"
            />
            <p className="text-xs text-muted-foreground mt-1">{editTitle.length}/80 characters</p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" />
              Description
            </label>
            <Textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={8}
              className="rounded-xl font-mono text-xs"
              data-testid="edit-description-input"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                Price
              </label>
              <Input
                type="number"
                step="0.01"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                className="rounded-xl"
                data-testid="edit-price-input"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Condition</label>
              <Select value={editConditionId} onValueChange={setEditConditionId}>
                <SelectTrigger className="rounded-xl" data-testid="edit-condition-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Category</label>
              <Input
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="rounded-xl"
                data-testid="edit-category-input"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Item Specifics</label>
              <Button variant="ghost" size="sm" onClick={addSpecific} data-testid="add-specific-button">
                + Add
              </Button>
            </div>
            <div className="space-y-2">
              {Object.entries(editSpecifics).map(([key, value]) => (
                <div key={key} className="flex gap-2 items-center">
                  <Input
                    value={key}
                    onChange={(e) => {
                      const newSpecifics = { ...editSpecifics };
                      delete newSpecifics[key];
                      newSpecifics[e.target.value] = value;
                      setEditSpecifics(newSpecifics);
                    }}
                    placeholder="Key"
                    className="rounded-xl w-1/3"
                    data-testid={`specific-key-${key}`}
                  />
                  <Input
                    value={value}
                    onChange={(e) => updateSpecific(key, e.target.value)}
                    placeholder="Value"
                    className="rounded-xl flex-1"
                    data-testid={`specific-value-${key}`}
                  />
                  <button onClick={() => removeSpecific(key)} className="text-muted-foreground hover:text-destructive" data-testid={`remove-specific-${key}`}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleCreateListing}
              disabled={creating || !editTitle || !editPrice}
              className="flex-1 rounded-xl"
              data-testid="create-listing-button"
            >
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating on eBay...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Create eBay Listing
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {step === "result" && result && (
        <div className="space-y-5">
          <div className={`rounded-xl border p-5 ${result.success ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30" : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"}`}>
            <div className="flex items-start gap-3">
              {result.success ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <h3 className="font-bold text-base" data-testid="listing-result-title">
                  {result.success ? "Listing Created!" : "Listing Failed"}
                </h3>
                {result.sku && (
                  <p className="text-sm text-muted-foreground mt-1">SKU: <code className="bg-background/60 px-1.5 py-0.5 rounded text-xs">{result.sku}</code></p>
                )}
                {result.offerId && (
                  <p className="text-sm text-muted-foreground mt-1">Offer ID: <code className="bg-background/60 px-1.5 py-0.5 rounded text-xs">{result.offerId}</code></p>
                )}
                {result.listingId && (
                  <p className="text-sm mt-2">
                    <a href={`https://www.ebay.com/itm/${result.listingId}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline" data-testid="view-listing-link">
                      View on eBay →
                    </a>
                  </p>
                )}
                {result.error && (
                  <p className="text-sm text-red-700 dark:text-red-300 mt-2" data-testid="listing-error-message">{result.error}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            {result.offerId && !result.listingId && (
              <Button
                onClick={handlePublish}
                disabled={publishing}
                className="flex-1 rounded-xl"
                data-testid="publish-listing-button"
              >
                {publishing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Publish on eBay
                  </>
                )}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={resetForm}
              className="flex-1 rounded-xl"
              data-testid="new-listing-button"
            >
              Create Another Listing
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
