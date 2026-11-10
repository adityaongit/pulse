// What the coach setup offers the browser: provider ids, labels and default models, never keys or URLs.
import { getConfig } from "../config";
import { PROVIDERS, providerOf } from "./providers";

export type ProviderOption = {
  id: string;
  label: string;
  model: string;
  keyUrl: string | null;
  needsKey: boolean;
  needsUrl?: boolean;
  defaultUrl?: string;
};

/** The owner's local model first when set, the test model only under COACH_MOCK, then the BYOK providers. */
export function providerOptions(): ProviderOption[] {
  const cfg = getConfig();
  return [
    ...(cfg.coachLocal ? [{ id: "local", label: "This server’s model", model: cfg.coachLocal.model, keyUrl: null, needsKey: false }] : []),
    ...(cfg.coachMock ? [{ id: "mock", label: "Test model", model: "mock", keyUrl: null, needsKey: false }] : []),
    ...PROVIDERS.map((p) => ({ id: p.id, label: p.label, model: p.model, keyUrl: p.keyUrl, needsKey: true })),
    {
      id: "custom",
      label: "Custom / Local",
      model: "llama3.2",
      keyUrl: null,
      needsKey: false,
      needsUrl: true,
      defaultUrl: "http://localhost:11434/v1",
    },
  ];
}

export const providerLabel = (id: string | null) =>
  id === "local" ? "this server’s model" : id === "mock" ? "the test model" : id === "custom" ? "Custom / Local" : (providerOf(id ?? "")?.label ?? "your provider");
