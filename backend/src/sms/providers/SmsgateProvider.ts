import type { SmsConfigStatus, SmsProvider, SmsSendResult } from "../SmsProvider";

function loadConfig() {
  const url = process.env.SMSGATE_URL?.trim() || "";
  const username = process.env.SMSGATE_USERNAME?.trim() || "";
  const password = process.env.SMSGATE_PASSWORD?.trim() || "";

  const missing: string[] = [];
  if (!url) missing.push("SMSGATE_URL");
  if (!username) missing.push("SMSGATE_USERNAME");
  if (!password) missing.push("SMSGATE_PASSWORD");

  return { url, username, password, missing };
}

export class SmsgateProvider implements SmsProvider {
  getConfigStatus(): SmsConfigStatus {
    const { missing } = loadConfig();
    return {
      configured: missing.length === 0,
      provider: "smsgate",
      missing,
    };
  }

  private requireConfig() {
    const config = loadConfig();
    if (config.missing.length > 0) {
      throw new Error(`SMS gateway is not configured. Missing: ${config.missing.join(", ")}`);
    }
    return config;
  }

  async send(phoneNumbers: string[], text: string): Promise<SmsSendResult> {
    const { url, username, password } = this.requireConfig();
    const auth = Buffer.from(`${username}:${password}`).toString("base64");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        textMessage: { text },
        phoneNumbers,
      }),
    });

    const body = await res.text();
    if (!res.ok) {
      throw new Error(body || `SMS gateway error (${res.status})`);
    }

    return {};
  }
}
