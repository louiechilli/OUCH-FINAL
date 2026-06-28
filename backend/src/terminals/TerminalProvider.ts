export interface TerminalReader {
  id: string;
  name: string;
  status: "unknown" | "processing" | "paired" | "expired";
  device?: {
    identifier: string;
    model: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface TerminalDeviceStatus {
  status: "ONLINE" | "OFFLINE";
  state?:
    | "IDLE"
    | "SELECTING_TIP"
    | "WAITING_FOR_CARD"
    | "WAITING_FOR_PIN"
    | "WAITING_FOR_SIGNATURE"
    | "UPDATING_FIRMWARE";
  batteryLevel?: number;
  connectionType?: string;
  firmwareVersion?: string;
  lastActivity?: string;
}

export interface TerminalCheckoutResult {
  clientTransactionId: string;
}

export interface TerminalTransaction {
  clientTransactionId: string;
  status: string;
  amount?: number;
  currency?: string;
  transactionCode?: string;
  timestamp?: string;
}

export interface TerminalConfigStatus {
  configured: boolean;
  merchantCode: string | null;
  currency: string;
  missing: string[];
}

export interface TerminalProvider {
  getConfigStatus(): TerminalConfigStatus;
  listReaders(): Promise<TerminalReader[]>;
  getReader(readerId: string): Promise<TerminalReader>;
  pairReader(pairingCode: string, name: string): Promise<TerminalReader>;
  deleteReader(readerId: string): Promise<void>;
  getReaderStatus(readerId: string): Promise<TerminalDeviceStatus>;
  createCheckout(
    readerId: string,
    amountMinorUnits: number,
    description?: string
  ): Promise<TerminalCheckoutResult>;
  getTransaction(clientTransactionId: string): Promise<TerminalTransaction | null>;
  terminateCheckout(readerId: string): Promise<void>;
}
