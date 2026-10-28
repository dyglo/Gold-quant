import { synth, type Series } from "./synthetic";

export type Loaded = { data: Series; label: string; meta?: {
  lastBar?: Record<string, { obs_date: string; value: number; available_at: string } | null>;
  sources?: unknown[]; qualityFlags?: unknown[]; asOf?: string; fingerprint?: string;
  events?: { kind: string; event_date: string; source_url: string }[];
  lagDefaults?: Record<string, number>;
} };

/** Browser-side loader. Calls /api/series; falls back to synthetic data if it fails.
 *  Labels that start with "Live" or "Imported" are treated as real data (no synthetic warnings). */
export async function loadSeries(): Promise<Loaded> {
  try {
    const r = await fetch("/api/series");
    if (r.ok) return (await r.json()) as Loaded;
  } catch {}
  return { data: synth(7), label: "Synthetic sample data (not market data) · seed 7" };
}
