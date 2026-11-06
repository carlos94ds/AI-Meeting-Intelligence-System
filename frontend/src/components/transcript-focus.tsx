import { createContext, useContext } from 'react'
import type { Segment } from '@/lib/types'

/** Beschikbaar binnen het vergaderdetail: laat een bronlink naar een fragment scrollen. */
export interface TranscriptFocus {
  meetingId: number
  focus: (segmentId: number) => void
  segment: (segmentId: number) => Segment | undefined
}

export const TranscriptFocusContext = createContext<TranscriptFocus | null>(null)

export const useTranscriptFocus = () => useContext(TranscriptFocusContext)
