/** Vaste sprekerkleuren; volledig uitgeschreven zodat Tailwind ze meeneemt. */
export const SPEAKER_COLORS: Record<string, { dot: string; text: string; soft: string }> = {
  amber: { dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300', soft: 'bg-amber-500/10' },
  violet: { dot: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300', soft: 'bg-violet-500/10' },
  emerald: { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', soft: 'bg-emerald-500/10' },
  sky: { dot: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-300', soft: 'bg-sky-500/10' },
  rose: { dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300', soft: 'bg-rose-500/10' },
  teal: { dot: 'bg-teal-500', text: 'text-teal-700 dark:text-teal-300', soft: 'bg-teal-500/10' },
  slate: { dot: 'bg-slate-400', text: 'text-slate-600 dark:text-slate-300', soft: 'bg-slate-500/10' },
}

export const speakerColor = (color: string) => SPEAKER_COLORS[color] ?? SPEAKER_COLORS.slate
