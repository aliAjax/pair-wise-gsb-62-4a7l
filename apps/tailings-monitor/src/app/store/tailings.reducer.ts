import { createReducer, on } from '@ngrx/store'
import type { Anomaly, TailingsDataset, WorkflowContext } from '../domain'
import {
  approvePlan,
  buildReviewPackage,
  confirmPlanBasis,
  interruptRecalc,
  normalizeDataset,
  recalcTick,
  requestRecalc,
  resumeRecalc,
  saveDispositionPlan,
  submitThresholdDraft
} from '../domain'
import { seedDataset } from '../data/seed'
import { TailingsActions } from './tailings.actions'

export interface TailingsState {
  dataset: TailingsDataset
  loading: boolean
  error: string
  selectedAnomalyId: string
  keyword: string
  status: Anomaly['status'] | '全部'
  notice: string
}

export const initialTailingsState: TailingsState = {
  dataset: structuredClone(seedDataset),
  loading: false,
  error: '',
  selectedAnomalyId: seedDataset.anomalies[0]?.id ?? '',
  keyword: '',
  status: '全部',
  notice: ''
}

let idSeed = 50
const ctx = (operator: string): WorkflowContext => ({
  now: new Date().toISOString(),
  operator,
  nextId: (prefix) => `${prefix}-${Date.now()}-${idSeed++}`
})

/** 在数据集克隆上执行工作流，rejected 非空时写入提示（拒绝原因已留痕审计） */
const run = (state: TailingsState, operator: string, fn: (dataset: TailingsDataset, context: WorkflowContext) => string): TailingsState => {
  const dataset = structuredClone(state.dataset)
  const rejected = fn(dataset, ctx(operator))
  return { ...state, dataset, notice: rejected }
}

export const tailingsReducer = createReducer(
  initialTailingsState,
  on(TailingsActions.loadDataset, (state) => ({ ...state, loading: true, error: '' })),
  on(TailingsActions.loadDatasetSuccess, (state, { dataset }) => ({ ...state, dataset: normalizeDataset(dataset), loading: false, selectedAnomalyId: dataset.anomalies[0]?.id ?? '' })),
  on(TailingsActions.loadDatasetFailure, (state, { error }) => ({ ...state, loading: false, error })),
  on(TailingsActions.submitFieldReview, (state, { anomalyId, review }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || !review.observed || !review.evidence || !review.reassessment) return state
    anomaly.fieldReviews.unshift({ ...review, version: anomaly.fieldReviews.length + 1 })
    anomaly.status = '原因调查中'
    anomaly.version += 1
    dataset.audit.unshift({ id: ctx(review.inspector).nextId('AUD'), entityId: anomalyId, action: '提交现场复核', operator: review.inspector, detail: review.reassessment, createdAt: new Date().toISOString() })
    return { ...state, dataset, notice: '' }
  }),
  on(TailingsActions.addExpertOpinion, (state, { anomalyId, opinion }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || !opinion.content) return state
    anomaly.opinions.unshift(opinion)
    anomaly.version += 1
    dataset.audit.unshift({ id: ctx(opinion.specialist).nextId('AUD'), entityId: anomalyId, action: '补充专业意见', operator: opinion.specialist, detail: `${opinion.conclusion}：${opinion.content}`, createdAt: new Date().toISOString() })
    return { ...state, dataset, notice: '' }
  }),
  on(TailingsActions.saveDispositionPlan, (state, { anomalyId, plan }) => run(state, '当前用户', (dataset, context) => saveDispositionPlan(dataset, anomalyId, plan, context))),
  on(TailingsActions.approvePlan, (state, { anomalyId, approver, note }) => run(state, approver, (dataset, context) => approvePlan(dataset, anomalyId, approver, note, context))),
  on(TailingsActions.confirmPlanBasis, (state, { anomalyId, operator }) => run(state, operator, (dataset, context) => confirmPlanBasis(dataset, anomalyId, context))),
  on(TailingsActions.closeAnomaly, (state, { anomalyId, note }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || !anomaly.plan.approvedBy || !anomaly.fieldReviews.length || !note.trim()) return state
    anomaly.status = '已关闭'
    anomaly.closedAt = new Date().toISOString()
    anomaly.version += 1
    dataset.audit.unshift({ id: ctx(anomaly.plan.approvedBy).nextId('AUD'), entityId: anomalyId, action: '关闭异常', operator: anomaly.plan.approvedBy, detail: note, createdAt: new Date().toISOString() })
    return { ...state, dataset, notice: '' }
  }),
  on(TailingsActions.createEmergencyLink, (state, { anomalyId, note }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly) return state
    anomaly.plan.emergencyLinked = true
    anomaly.status = '应急联动'
    anomaly.version += 1
    dataset.audit.unshift({ id: ctx('值班负责人').nextId('AUD'), entityId: anomalyId, action: '启动应急联动', operator: '值班负责人', detail: note, createdAt: new Date().toISOString() })
    return { ...state, dataset, notice: '' }
  }),
  on(TailingsActions.submitThresholdDraft, (state, { thresholdId, draft, operator }) => run(state, operator, (dataset, context) => submitThresholdDraft(dataset, thresholdId, draft, context))),
  on(TailingsActions.requestRecalc, (state, { anomalyId, operator }) => run(state, operator, (dataset, context) => requestRecalc(dataset, anomalyId, context))),
  on(TailingsActions.interruptRecalc, (state, { jobId, error }) => run(state, '重算引擎', (dataset, context) => interruptRecalc(dataset, jobId, error, context))),
  on(TailingsActions.resumeRecalc, (state, { jobId, operator }) => run(state, operator, (dataset, context) => resumeRecalc(dataset, jobId, context))),
  on(TailingsActions.recalcTick, (state) => run(state, '重算引擎', (dataset, context) => { recalcTick(dataset, context); return '' })),
  on(TailingsActions.buildReviewPackage, (state, { anomalyIds, operator }) => run(state, operator, (dataset, context) => {
    const result = buildReviewPackage(dataset, anomalyIds, context)
    return typeof result === 'string' ? result : ''
  })),
  on(TailingsActions.selectAnomaly, (state, { anomalyId }) => ({ ...state, selectedAnomalyId: anomalyId })),
  on(TailingsActions.updateKeyword, (state, { keyword }) => ({ ...state, keyword })),
  on(TailingsActions.updateStatus, (state, { status }) => ({ ...state, status: status as TailingsState['status'] })),
  on(TailingsActions.addAudit, (state, { entry }) => ({ ...state, dataset: { ...state.dataset, audit: [entry, ...state.dataset.audit] } })),
  on(TailingsActions.resetDemo, () => ({ ...initialTailingsState, dataset: structuredClone(seedDataset), selectedAnomalyId: seedDataset.anomalies[0].id }))
)
