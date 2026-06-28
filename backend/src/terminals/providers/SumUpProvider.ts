import { randomUUID } from "crypto";
import type {
  TerminalCheckoutResult,
  TerminalConfigStatus,
  TerminalDeviceStatus,
  TerminalProvider,
  TerminalReader,
  TerminalTransaction,
} from "../TerminalProvider";

const SUMUP_API_BASE = "https://api.sumup.com";

interface SumUpReader {
  id: string;
  name: string;
  status: TerminalReader["status"];
  device?: { identifier: string; model: string };
  created_at?: string;
  updated_at?: string;
}

interface SumUpProblem {
  title?: string;
  detail?: string;
  status?: number;
  errors?: { detail?: string; type?: string };
}

function minorUnitForCurrency(currency: string): number {
  return ["CLP", "COP", "HUF"].includes(currency.toUpperCase()) ? 0 : 2;
}

function loadConfig() {
  const apiKey = process.env.SUMUP_API_KEY?.trim() || "";
  const merchantCode = process.env.SUMUP_MERCHANT_CODE?.trim() || "";
  const affiliateAppId = process.env.SUMUP_AFFILIATE_APP_ID?.trim() || "";
  const affiliateKey = process.env.SUMUP_AFFILIATE_KEY?.trim() || "";
  const currency = (process.env.SUMUP_CURRENCY?.trim() || "GBP").toUpperCase();

  const missing: string[] = [];
  if (!apiKey) missing.push("SUMUP_API_KEY");
  if (!merchantCode) missing.push("SUMUP_MERCHANT_CODE");
  if (!affiliateAppId) missing.push("SUMUP_AFFILIATE_APP_ID");
  if (!affiliateKey) missing.push("SUMUP_AFFILIATE_KEY");

  return { apiKey, merchantCode, affiliateAppId, affiliateKey, currency, missing };
}

function fromSumUpReader(reader: SumUpReader): TerminalReader {
  return {
    id: reader.id,
    name: reader.name,
    status: reader.status,
    device: reader.device,
    createdAt: reader.created_at,
    updatedAt: reader.updated_at,
  };
}

function formatSumUpError(status: number, body: unknown): string {
  const problem = body as SumUpProblem;
  if (problem?.errors?.detail) return problem.errors.detail;
  if (problem?.detail) return problem.detail;
  if (problem?.title) return problem.title;
  if (typeof body === "object" && body !== null && "errors" in body) {
    const errors = (body as { errors?: Record<string, unknown> }).errors;
    if (errors && typeof errors.detail === "string") return errors.detail;
    if (errors && typeof errors.type === "string") return errors.type;
  }
  return `SumUp API error (${status})`;
}

export class SumUpProvider implements TerminalProvider {
  private get config() {
    return loadConfig();
  }

  getConfigStatus(): TerminalConfigStatus {
    const { merchantCode, currency, missing } = this.config;
    return {
      configured: missing.length === 0,
      merchantCode: merchantCode || null,
      currency,
      missing,
    };
  }

  private requireConfig() {
    const config = this.config;
    if (config.missing.length > 0) {
      throw new Error(`SumUp is not configured. Missing: ${config.missing.join(", ")}`);
    }
    return config;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const { apiKey } = this.requireConfig();
    const res = await fetch(`${SUMUP_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (res.status === 204) {
      return undefined as T;
    }

    const text = await res.text();
    const parsed = text ? (JSON.parse(text) as unknown) : null;

    if (!res.ok) {
      throw new Error(formatSumUpError(res.status, parsed));
    }

    return parsed as T;
  }

  async listReaders(): Promise<TerminalReader[]> {
    const { merchantCode } = this.requireConfig();
    const data = await this.request<{ items: SumUpReader[] }>(
      "GET",
      `/v0.1/merchants/${encodeURIComponent(merchantCode)}/readers`
    );
    return (data.items ?? []).map(fromSumUpReader);
  }

  async getReader(readerId: string): Promise<TerminalReader> {
    const { merchantCode } = this.requireConfig();
    const reader = await this.request<SumUpReader>(
      "GET",
      `/v0.1/merchants/${encodeURIComponent(merchantCode)}/readers/${encodeURIComponent(readerId)}`
    );
    return fromSumUpReader(reader);
  }

  async pairReader(pairingCode: string, name: string): Promise<TerminalReader> {
    const { merchantCode } = this.requireConfig();
    const reader = await this.request<SumUpReader>(
      "POST",
      `/v0.1/merchants/${encodeURIComponent(merchantCode)}/readers`,
      {
        pairing_code: pairingCode.trim().toUpperCase(),
        name: name.trim(),
      }
    );
    return fromSumUpReader(reader);
  }

  async deleteReader(readerId: string): Promise<void> {
    const { merchantCode } = this.requireConfig();
    await this.request(
      "DELETE",
      `/v0.1/merchants/${encodeURIComponent(merchantCode)}/readers/${encodeURIComponent(readerId)}`
    );
  }

  async getReaderStatus(readerId: string): Promise<TerminalDeviceStatus> {
    const { merchantCode } = this.requireConfig();
    const data = await this.request<{
      data: {
        status: TerminalDeviceStatus["status"];
        state?: TerminalDeviceStatus["state"];
        battery_level?: number;
        connection_type?: string;
        firmware_version?: string;
        last_activity?: string;
      };
    }>(
      "GET",
      `/v0.1/merchants/${encodeURIComponent(merchantCode)}/readers/${encodeURIComponent(readerId)}/status`
    );

    return {
      status: data.data.status,
      state: data.data.state,
      batteryLevel: data.data.battery_level,
      connectionType: data.data.connection_type,
      firmwareVersion: data.data.firmware_version,
      lastActivity: data.data.last_activity,
    };
  }

  async createCheckout(
    readerId: string,
    amountMinorUnits: number,
    description?: string
  ): Promise<TerminalCheckoutResult> {
    const { merchantCode, affiliateAppId, affiliateKey, currency } = this.requireConfig();
    const foreignTransactionId = randomUUID();

    const data = await this.request<{
      data: { client_transaction_id: string };
    }>(
      "POST",
      `/v0.1/merchants/${encodeURIComponent(merchantCode)}/readers/${encodeURIComponent(readerId)}/checkout`,
      {
        total_amount: {
          currency,
          minor_unit: minorUnitForCurrency(currency),
          value: amountMinorUnits,
        },
        description: description?.trim() || "EPOS test payment",
        affiliate: {
          app_id: affiliateAppId,
          key: affiliateKey,
          foreign_transaction_id: foreignTransactionId,
        },
      }
    );

    return { clientTransactionId: data.data.client_transaction_id };
  }

  async getTransaction(clientTransactionId: string): Promise<TerminalTransaction | null> {
    const { merchantCode } = this.requireConfig();
    const url = new URL(
      `/v2.1/merchants/${encodeURIComponent(merchantCode)}/transactions`,
      SUMUP_API_BASE
    );
    url.searchParams.set("client_transaction_id", clientTransactionId);

    const { apiKey } = this.requireConfig();
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (res.status === 404) return null;

    const text = await res.text();
    const parsed = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok) {
      throw new Error(formatSumUpError(res.status, parsed));
    }

    const tx = parsed as {
      status: string;
      amount?: number;
      currency?: string;
      transaction_code?: string;
      timestamp?: string;
    };

    return {
      clientTransactionId,
      status: tx.status,
      amount: tx.amount,
      currency: tx.currency,
      transactionCode: tx.transaction_code,
      timestamp: tx.timestamp,
    };
  }

  async terminateCheckout(readerId: string): Promise<void> {
    const { merchantCode } = this.requireConfig();
    await this.request(
      "POST",
      `/v0.1/merchants/${encodeURIComponent(merchantCode)}/readers/${encodeURIComponent(readerId)}/terminate`
    );
  }
}
