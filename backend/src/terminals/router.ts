import { Router } from "express";
import { requireAdmin } from "../auth/middleware";
import { logActivity } from "../activity/log";
import { getTerminalProvider } from "./index";
import {
  deleteStoredTerminal,
  listStoredTerminals,
  setDefaultTerminal,
  upsertStoredTerminal,
} from "./service";

export const terminalsRouter = Router();

terminalsRouter.use(requireAdmin);

function handleProviderError(res: import("express").Response, err: unknown) {
  const message = err instanceof Error ? err.message : "Terminal provider error";
  if (message.includes("not configured")) {
    res.status(503).json({ error: message });
    return;
  }
  res.status(502).json({ error: message });
}

/** SumUp credentials status (no secrets exposed). */
terminalsRouter.get("/config", (_req, res) => {
  const provider = getTerminalProvider();
  res.json(provider.getConfigStatus());
});

/** List locally stored terminals enriched with live SumUp reader data. */
terminalsRouter.get("/readers", async (_req, res) => {
  try {
    const provider = getTerminalProvider();
    const stored = await listStoredTerminals();
    const remoteReaders = await provider.listReaders().catch(() => []);
    const remoteById = new Map(remoteReaders.map((r) => [r.id, r]));

    res.json({
      readers: stored.map((terminal) => {
        const remote = remoteById.get(terminal.externalId);
        return {
          ...terminal,
          remoteStatus: remote?.status ?? null,
          device: remote?.device ?? null,
        };
      }),
      remoteOnly: remoteReaders
        .filter((r) => !stored.some((s) => s.externalId === r.id))
        .map((r) => ({
          externalId: r.id,
          name: r.name,
          status: r.status,
          device: r.device ?? null,
        })),
    });
  } catch (err) {
    handleProviderError(res, err);
  }
});

/** Pair a new Solo reader using the code shown on the device. */
terminalsRouter.post("/readers", async (req, res) => {
  const { pairingCode, name, setAsDefault } = req.body as {
    pairingCode?: string;
    name?: string;
    setAsDefault?: boolean;
  };

  if (!pairingCode?.trim() || !name?.trim()) {
    res.status(400).json({ error: "pairingCode and name are required" });
    return;
  }

  try {
    const provider = getTerminalProvider();
    const reader = await provider.pairReader(pairingCode, name);
    const stored = await upsertStoredTerminal({
      provider: "sumup",
      externalId: reader.id,
      name: reader.name,
      deviceModel: reader.device?.model,
      deviceIdentifier: reader.device?.identifier,
      isDefault: setAsDefault ?? true,
    });

    await logActivity({
      entityType: "payment_terminal",
      entityId: stored.id,
      eventType: "paired",
      actorUserId: req.user!.id,
      description: `Paired SumUp reader "${reader.name}"`,
      metadata: { externalId: reader.id, status: reader.status },
    });

    res.status(201).json({ reader, stored });
  } catch (err) {
    handleProviderError(res, err);
  }
});

/** Set the default terminal for checkout. */
terminalsRouter.post("/readers/:id/default", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid terminal id" });
    return;
  }

  const updated = await setDefaultTerminal(id);
  if (!updated) {
    res.status(404).json({ error: "Terminal not found" });
    return;
  }

  res.json(updated);
});

/** Remove a paired reader from SumUp and local storage. */
terminalsRouter.delete("/readers/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid terminal id" });
    return;
  }

  const stored = (await listStoredTerminals()).find((t) => t.id === id);
  if (!stored) {
    res.status(404).json({ error: "Terminal not found" });
    return;
  }

  try {
    const provider = getTerminalProvider();
    await provider.deleteReader(stored.externalId);
    await deleteStoredTerminal(stored.provider, stored.externalId);

    await logActivity({
      entityType: "payment_terminal",
      entityId: id,
      eventType: "unpaired",
      actorUserId: req.user!.id,
      description: `Removed SumUp reader "${stored.name}"`,
      metadata: { externalId: stored.externalId },
    });

    res.json({ status: "ok" });
  } catch (err) {
    handleProviderError(res, err);
  }
});

/** Live connectivity and device state for a stored terminal. */
terminalsRouter.get("/readers/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid terminal id" });
    return;
  }

  const stored = (await listStoredTerminals()).find((t) => t.id === id);
  if (!stored) {
    res.status(404).json({ error: "Terminal not found" });
    return;
  }

  try {
    const provider = getTerminalProvider();
    const [deviceStatus, reader] = await Promise.all([
      provider.getReaderStatus(stored.externalId),
      provider.getReader(stored.externalId).catch(() => null),
    ]);

    res.json({
      terminalId: stored.id,
      externalId: stored.externalId,
      name: stored.name,
      pairingStatus: reader?.status ?? null,
      device: deviceStatus,
    });
  } catch (err) {
    handleProviderError(res, err);
  }
});

/** Send a test payment to the Solo reader. */
terminalsRouter.post("/readers/:id/test-payment", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid terminal id" });
    return;
  }

  const { amountMinorUnits } = req.body as { amountMinorUnits?: number };
  if (
    amountMinorUnits === undefined ||
    !Number.isInteger(amountMinorUnits) ||
    amountMinorUnits <= 0
  ) {
    res.status(400).json({ error: "amountMinorUnits must be a positive integer" });
    return;
  }

  const stored = (await listStoredTerminals()).find((t) => t.id === id);
  if (!stored) {
    res.status(404).json({ error: "Terminal not found" });
    return;
  }

  try {
    const provider = getTerminalProvider();
    const checkout = await provider.createCheckout(
      stored.externalId,
      amountMinorUnits,
      "EPOS test payment"
    );

    await logActivity({
      entityType: "payment_terminal",
      entityId: stored.id,
      eventType: "test_payment_started",
      actorUserId: req.user!.id,
      description: `Test payment sent to "${stored.name}"`,
      metadata: {
        clientTransactionId: checkout.clientTransactionId,
        amountMinorUnits,
      },
    });

    res.status(201).json({
      clientTransactionId: checkout.clientTransactionId,
      terminalId: stored.id,
      externalId: stored.externalId,
    });
  } catch (err) {
    handleProviderError(res, err);
  }
});

/** Poll transaction result after a reader checkout. */
terminalsRouter.get("/payments/:clientTransactionId", async (req, res) => {
  const { clientTransactionId } = req.params;
  if (!clientTransactionId?.trim()) {
    res.status(400).json({ error: "clientTransactionId is required" });
    return;
  }

  const terminalId = req.query.terminalId ? Number(req.query.terminalId) : null;

  try {
    const provider = getTerminalProvider();
    const transaction = await provider.getTransaction(clientTransactionId);

    let deviceStatus = null;
    if (terminalId && Number.isInteger(terminalId) && terminalId > 0) {
      const stored = (await listStoredTerminals()).find((t) => t.id === terminalId);
      if (stored) {
        deviceStatus = await provider.getReaderStatus(stored.externalId).catch(() => null);
      }
    }

    const terminalStatuses = ["SUCCESSFUL", "FAILED", "CANCELLED", "REFUNDED", "CHARGE_BACK"];
    const isTerminal =
      transaction !== null && terminalStatuses.includes(transaction.status.toUpperCase());

    res.json({
      transaction,
      device: deviceStatus,
      pending: !isTerminal,
    });
  } catch (err) {
    handleProviderError(res, err);
  }
});

/** Cancel an in-progress checkout on the reader. */
terminalsRouter.post("/readers/:id/terminate", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid terminal id" });
    return;
  }

  const stored = (await listStoredTerminals()).find((t) => t.id === id);
  if (!stored) {
    res.status(404).json({ error: "Terminal not found" });
    return;
  }

  try {
    const provider = getTerminalProvider();
    await provider.terminateCheckout(stored.externalId);
    res.json({ status: "ok" });
  } catch (err) {
    handleProviderError(res, err);
  }
});
