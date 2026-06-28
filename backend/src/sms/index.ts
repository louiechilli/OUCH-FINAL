import type { SmsProvider } from "./SmsProvider";
import { SmsgateProvider } from "./providers/SmsgateProvider";

let provider: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (!provider) {
    const name = (process.env.SMS_PROVIDER ?? "smsgate").toLowerCase();
    if (name !== "smsgate") {
      throw new Error(`Unknown SMS provider: ${name}`);
    }
    provider = new SmsgateProvider();
  }
  return provider;
}

export type { SmsProvider, SmsConfigStatus, SmsSendResult } from "./SmsProvider";
