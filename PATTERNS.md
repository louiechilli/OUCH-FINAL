# Codebase Patterns

Prime examples to follow when contributing to this codebase. Each entry: the
rule, why it matters here, and a concrete example.

## 1. Connectors are interfaces first, providers second

When integrating a third-party service (payments, billing, printers, etc.),
don't wire the provider's SDK directly into application code. Define an
interface for the *capability* you need, implement the provider behind it,
and select the implementation via config. This keeps provider swaps (e.g.
SumUp → Stripe → Square) to a config change and a new adapter file, not a
rewrite.

**Why it matters here:** this is an EPOS — payment/billing providers are
exactly the kind of dependency a tattoo studio business might need to swap
(better rates, hardware support, regional availability). Hardcoding SumUp's
API into checkout logic now means a painful rip-and-replace later.

**Example — adding SumUp for billing:**

```
backend/src/billing/
  BillingProvider.ts      // interface: charge(), refund(), getStatus()
  providers/
    SumUpProvider.ts       // implements BillingProvider using SumUp's SDK
    StripeProvider.ts      // implements BillingProvider using Stripe's SDK
  index.ts                 // picks provider from config, exports BillingProvider instance
```

```ts
// BillingProvider.ts
export interface ChargeResult {
  id: string;
  status: "succeeded" | "failed" | "pending";
}

export interface BillingProvider {
  charge(amountCents: number, currency: string): Promise<ChargeResult>;
  refund(chargeId: string): Promise<void>;
}
```

```ts
// providers/SumUpProvider.ts
import type { BillingProvider, ChargeResult } from "../BillingProvider";

export class SumUpProvider implements BillingProvider {
  async charge(amountCents: number, currency: string): Promise<ChargeResult> {
    // SumUp SDK calls live only here
  }
  async refund(chargeId: string): Promise<void> {
    // SumUp SDK calls live only here
  }
}
```

```ts
// index.ts
import { SumUpProvider } from "./providers/SumUpProvider";
import { StripeProvider } from "./providers/StripeProvider";
import type { BillingProvider } from "./BillingProvider";

const providers: Record<string, () => BillingProvider> = {
  sumup: () => new SumUpProvider(),
  stripe: () => new StripeProvider(),
};

export const billingProvider: BillingProvider =
  providers[process.env.BILLING_PROVIDER ?? "sumup"]();
```

Application code (checkout routes, order logic) only ever imports
`billingProvider` from `billing/index.ts` and calls `.charge()` /
`.refund()`. It never imports a provider class or SDK directly.

**Applies to:** payment/billing, card readers, printers (receipt/label),
SMS/email notifications, and any other "swap-the-vendor" dependency.
