import type { LearningRules } from '../../lib/learning-engine'
import { DEFAULT_LEARNING_RULES } from '../../lib/learning-engine'

export type Session = {
  id: string
  topic: string
  subject: string
  minutes: number
  attempted: number
  correct: number
  studiedAt: string
  method: string
  difficulty: string
  reflection: string
}

export type Plan = {
  id: string
  topic: string
  date: string
  minutes: number
  complete: boolean
}

export type Review = {
  week: string
  wins: string
  difficulties: string
  lessons: string
  nextFocus: string
  updatedAt: string
}

export type AuditRecord = {
  id: string
  action: 'session.corrected' | 'session.deleted'
  recordId: string
  at: string
  before: Session
  after: Session | null
}

export type Store = {
  sessions: Session[]
  topics: string[]
  plans: Plan[]
  reviews: Review[]
  groups: string[]
  audit: AuditRecord[]
  name: string
  rules: LearningRules
  theme: 'dark' | 'light'
}

export const EMPTY_WORKSPACE: Store = {
  sessions: [],
  topics: [],
  plans: [],
  reviews: [],
  groups: [],
  audit: [],
  name: '',
  rules: DEFAULT_LEARNING_RULES,
  theme: 'dark',
}

