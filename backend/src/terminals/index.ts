import type { TerminalProvider } from "./TerminalProvider";
import { SumUpProvider } from "./providers/SumUpProvider";

let provider: TerminalProvider | null = null;

export function getTerminalProvider(): TerminalProvider {
  if (!provider) {
    const name = (process.env.TERMINAL_PROVIDER ?? "sumup").toLowerCase();
    if (name !== "sumup") {
      throw new Error(`Unknown terminal provider: ${name}`);
    }
    provider = new SumUpProvider();
  }
  return provider;
}

export type {
  TerminalProvider,
  TerminalReader,
  TerminalDeviceStatus,
  TerminalCheckoutResult,
  TerminalTransaction,
  TerminalConfigStatus,
} from "./TerminalProvider";
