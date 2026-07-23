export type EbayErrorKind =
  | "reauthorization_required"
  | "missing_scope"
  | "upstream_error";

export interface EbayUpstreamDetail {
  errorId?: number | string;
  domain?: string;
  subdomain?: string;
  category?: string;
  message?: string;
  longMessage?: string;
  parameter?: string;
  value?: string;
  parameters?: Array<{ name?: string; value?: string }>;
}

export class EbayIntegrationError extends Error {
  readonly code: EbayErrorKind;
  readonly operation: string;
  readonly upstreamStatus?: number;
  readonly upstreamDetails: EbayUpstreamDetail[];
  readonly reconnectRequired: boolean;

  constructor(options: {
    code: EbayErrorKind;
    operation: string;
    message: string;
    upstreamStatus?: number;
    upstreamDetails?: EbayUpstreamDetail[];
  }) {
    super(options.message);
    this.name = "EbayIntegrationError";
    this.code = options.code;
    this.operation = options.operation;
    this.upstreamStatus = options.upstreamStatus;
    this.upstreamDetails = options.upstreamDetails ?? [];
    this.reconnectRequired =
      options.code === "reauthorization_required" ||
      options.code === "missing_scope";
  }
}

function redact(value: string): string {
  return value
    .replace(/(authorization["']?\s*[:=]\s*["']?)(?:basic|bearer)\s+[^\s"',}]+/gi, "$1[REDACTED]")
    .replace(/((?:access|refresh)_token["']?\s*[:=]\s*["']?)[^"',}\s]+/gi, "$1[REDACTED]")
    .replace(/(client_secret["']?\s*[:=]\s*["']?)[^"',}\s]+/gi, "$1[REDACTED]");
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return redact(value);
}

function parseDetails(body: unknown): EbayUpstreamDetail[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  const rawErrors = Array.isArray(record.errors)
    ? record.errors
    : record.error
      ? [record]
      : [];

  return rawErrors.map((entry) => {
    const error = entry && typeof entry === "object"
      ? entry as Record<string, unknown>
      : { message: String(entry) };
    const parameters = Array.isArray(error.parameters) ? error.parameters : [];
    const safeParameters = parameters.map((parameter) => {
      const item = parameter && typeof parameter === "object"
        ? parameter as Record<string, unknown>
        : {};
      const name = stringValue(item.name);
      return {
        name,
        value: name && /authorization|token|secret/i.test(name)
          ? "[REDACTED]"
          : stringValue(item.value),
      };
    });
    const firstParameter = safeParameters[0];
    return {
      errorId: typeof error.errorId === "number" || typeof error.errorId === "string"
        ? error.errorId
        : undefined,
      domain: stringValue(error.domain),
      subdomain: stringValue(error.subdomain),
      category: stringValue(error.category),
      message: stringValue(error.message) ?? stringValue(record.error_description) ?? stringValue(record.error),
      longMessage: stringValue(error.longMessage),
      parameter: firstParameter?.name,
      value: firstParameter?.value,
      parameters: safeParameters.length > 0 ? safeParameters : undefined,
    };
  });
}

function classify(
  status: number,
  details: EbayUpstreamDetail[],
  rawText: string,
): EbayErrorKind {
  const combined = [
    rawText,
    ...details.flatMap((detail) => [
      detail.category,
      detail.message,
      detail.longMessage,
    ]),
  ].filter(Boolean).join(" ").toLowerCase();

  if (
    status === 403 ||
    combined.includes("invalid_scope") ||
    combined.includes("insufficient scope") ||
    combined.includes("scope is missing") ||
    combined.includes("authorization scope")
  ) {
    return "missing_scope";
  }
  if (
    status === 401 ||
    combined.includes("invalid_grant") ||
    combined.includes("revoked") ||
    combined.includes("invalid access token") ||
    combined.includes("token is expired")
  ) {
    return "reauthorization_required";
  }
  return "upstream_error";
}

export async function ebayErrorFromResponse(
  response: Response,
  operation: string,
): Promise<EbayIntegrationError> {
  return ebayErrorFromText(response.status, await response.text(), operation);
}

export function ebayErrorFromText(
  status: number,
  responseText: string,
  operation: string,
): EbayIntegrationError {
  const rawText = redact(responseText);
  let body: unknown;
  try {
    body = JSON.parse(rawText);
  } catch {
    body = undefined;
  }
  const details = parseDetails(body);
  const code = classify(status, details, rawText);
  const message = code === "missing_scope"
    ? "eBay authorization is missing a required permission. Reconnect the eBay account to grant the current permissions."
    : code === "reauthorization_required"
      ? "eBay authorization has expired or was revoked. Reconnect the eBay account."
      : `eBay could not complete ${operation}. Try again later or review the eBay integration diagnostics.`;

  return new EbayIntegrationError({
    code,
    operation,
    message,
    upstreamStatus: status,
    upstreamDetails: details.length > 0
      ? details
      : rawText
        ? [{ message: rawText }]
        : [],
  });
}

export function logEbayError(error: unknown): void {
  if (error instanceof EbayIntegrationError) {
    console.error("[ebay-integration]", JSON.stringify({
      operation: error.operation,
      code: error.code,
      upstreamStatus: error.upstreamStatus,
      upstreamDetails: error.upstreamDetails,
    }));
    return;
  }
  console.error("[ebay-integration]", redact(error instanceof Error ? error.message : String(error)));
}

export function safeEbayError(error: unknown): {
  message: string;
  code: EbayErrorKind | "internal_error";
  reconnectRequired: boolean;
} {
  if (error instanceof EbayIntegrationError) {
    return {
      message: error.message,
      code: error.code,
      reconnectRequired: error.reconnectRequired,
    };
  }
  return {
    message: "The eBay integration encountered an unexpected error.",
    code: "internal_error",
    reconnectRequired: false,
  };
}
