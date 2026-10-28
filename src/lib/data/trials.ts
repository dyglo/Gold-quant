import { digest } from '../backend/http';

type Trial = { config: Record<string, unknown>; dataFingerprint: string; results: unknown; deflatedSharpeInputs: unknown; candidateCount: number };
/** Serial writes prevent old responses from overwriting a newer trial total. */
export function trialRecorder(update: (count: number | null) => void) {
  const saved = new Set<string>();
  let chain = Promise.resolve();
  return {
    async load() {
      try { const r = await fetch('/api/trials'); if (!r.ok) throw new Error(); const b = await r.json(); update(b.summary.candidateCount); }
      catch { update(null); }
    },
    record(trial: Trial) {
      chain = chain.then(async () => {
        const key = await digest({ config: trial.config, fingerprint: trial.dataFingerprint });
        if (saved.has(key)) return;
        try {
          const r = await fetch('/api/trials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(trial) });
          if (!r.ok) throw new Error();
          const b = await r.json(); saved.add(key); update(b.summary.candidateCount);
        } catch { update(null); }
      }).catch(() => update(null));
    },
  };
}
