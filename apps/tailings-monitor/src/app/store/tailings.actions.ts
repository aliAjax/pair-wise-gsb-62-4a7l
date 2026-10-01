import { createActionGroup, emptyProps, props } from '@ngrx/store'
import type { AuditEntry, DispositionPlan, ExpertOpinion, FieldReview, TailingsDataset, ThresholdDraftInput } from '../domain'

export const TailingsActions = createActionGroup({
  source: 'Tailings',
  events: {
    'Load Dataset': emptyProps(),
    'Load Dataset Success': props<{ dataset: TailingsDataset }>(),
    'Load Dataset Failure': props<{ error: string }>(),
    'Submit Field Review': props<{ anomalyId: string; review: FieldReview }>(),
    'Add Expert Opinion': props<{ anomalyId: string; opinion: ExpertOpinion }>(),
    'Save Disposition Plan': props<{ anomalyId: string; plan: DispositionPlan }>(),
    'Approve Plan': props<{ anomalyId: string; approver: string; note: string }>(),
    'Confirm Plan Basis': props<{ anomalyId: string; operator: string }>(),
    'Close Anomaly': props<{ anomalyId: string; note: string }>(),
    'Create Emergency Link': props<{ anomalyId: string; note: string }>(),
    'Submit Threshold Draft': props<{ thresholdId: string; draft: ThresholdDraftInput; operator: string }>(),
    'Request Recalc': props<{ anomalyId: string; operator: string }>(),
    'Interrupt Recalc': props<{ jobId: string; error: string }>(),
    'Resume Recalc': props<{ jobId: string; operator: string }>(),
    'Recalc Tick': emptyProps(),
    'Build Review Package': props<{ anomalyIds: string[]; operator: string }>(),
    'Select Anomaly': props<{ anomalyId: string }>(),
    'Update Keyword': props<{ keyword: string }>(),
    'Update Status': props<{ status: string }>(),
    'Add Audit': props<{ entry: AuditEntry }>(),
    'Reset Demo': emptyProps()
  }
})
