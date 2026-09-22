export interface SmsSendResult {
  providerMessageId?: string;
}

export interface SmsConfigStatus {
  configured: boolean;
  provider: string;
  missing: string[];
}

export interface SmsProvider {
  getConfigStatus(): SmsConfigStatus;
  send(phoneNumbers: string[], text: string): Promise<SmsSendResult>;
}
