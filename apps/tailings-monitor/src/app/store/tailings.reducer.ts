import { createReducer, on } from '@ngrx/store'
import type {
  Anomaly,
  AuditEntry,
  PackageAnomalyLink,
  PinnedVersion,
  ReadingEvaluation,
  RecomputeJob,
  ReviewPackage,
  TailingsDataset,
  ThresholdVersion
} from '../domain'
import { evaluateReading, freezeScope, severityFor, activeVersion } from '../domain/rule-engine'
import { seedDataset } from '../data/seed'
import { TailingsActions } from './tailings.actions'

export interface TailingsState {
  dataset: TailingsDataset
  loading: boolean
  error: string
  selectedAnomalyId: string
  keyword: string
  status: Anomaly['status'] | '全部'
  /** 演示开关：下一条重算在断点处失败，用于验证从断点恢复 */
  failNextRecompute: boolean
  /** 非空时全平台按审阅包内的固定快照解释 */
  viewingPackageId: string
}

export const initialTailingsState: TailingsState = {
  dataset: structuredClone(seedDataset),
  loading: false,
  error: '',
  selectedAnomalyId: seedDataset.anomalies[0]?.id ?? '',
  keyword: '',
  status: '全部',
  failNextRecompute: false,
  viewingPackageId: ''
}

let idSeed = 50
const nextId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${idSeed++}`
const audit = (entityId: string, action: string, operator: string, detail: string): AuditEntry => ({ id: nextId('AUD'), entityId, action, operator, detail, createdAt: new Date().toISOString() })
const nowIso = (): string => new Date().toISOString()

const UNFINISHED: RecomputeJob['status'][] = ['待受理', '重算中', '失败可恢复']
const jobDone = (job: RecomputeJob): boolean => job.checkpoints.length >= job.total

/** 最新版本实例（含已失效，用于确定版本号顺序） */
const latestVersion = (dataset: TailingsDataset, thresholdId: string): ThresholdVersion | undefined =>
  dataset.thresholdVersions.filter((item) => item.thresholdId === thresholdId).sort((a, b) => b.version - a.version)[0]

const priorReading = (dataset: TailingsDataset, pointId: string, capturedAt: string) =>
  dataset.readings.filter((item) => item.pointId === pointId && Date.parse(item.capturedAt) < Date.parse(capturedAt)).sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))[0]

const jobTouchesAnomaly = (dataset: TailingsDataset, job: RecomputeJob, anomalyId: string): boolean => {
  if (job.anomalyIds.includes(anomalyId)) return true
  const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
  return !!anomaly && job.affectedPointIds.includes(anomaly.pointId)
}

/** 用读数当前评判同步测点状态 */
const syncPointStatuses = (dataset: TailingsDataset): void => {
  for (const point of dataset.points) {
    const latest = dataset.readings.filter((item) => item.pointId === point.id).sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))[0]
    const evaluation = latest ? dataset.evaluations.find((item) => item.readingId === latest.id) : undefined
    if (evaluation) point.status = evaluation.currentVerdict === '异常' ? '异常' : evaluation.currentVerdict === '预警' ? '预警' : '正常'
  }
}

export const tailingsReducer = createReducer(
  initialTailingsState,
  on(TailingsActions.loadDataset, (state) => ({ ...state, loading: true, error: '' })),
  on(TailingsActions.loadDatasetSuccess, (state, { dataset }) => {
    const normalized: TailingsDataset = {
      points: dataset.points ?? [],
      thresholdVersions: dataset.thresholdVersions ?? [],
      readings: dataset.readings ?? [],
      evaluations: dataset.evaluations ?? [],
      anomalies: dataset.anomalies ?? [],
      recomputeJobs: dataset.recomputeJobs ?? [],
      conclusions: dataset.conclusions ?? [],
      reviewPackages: dataset.reviewPackages ?? [],
      audit: dataset.audit ?? []
    }
    return { ...state, dataset: normalized, loading: false, viewingPackageId: '', selectedAnomalyId: normalized.anomalies[0]?.id ?? '' }
  }),
  on(TailingsActions.loadDatasetFailure, (state, { error }) => ({ ...state, loading: false, error })),

  // 阈值草稿提交：冻结新版本与重算范围，旧读数保留原判进入待重算，在途旧任务被取代，相关异常审批暂停
  on(TailingsActions.submitThresholdDraft, (state, { thresholdId, warning, alarm, changeRate, changeNote }) => {
    if (!(alarm > warning)) return state
    const previous = latestVersion(state.dataset, thresholdId)
    if (!previous || !changeNote.trim()) return state
    if (previous.warning === warning && previous.alarm === alarm && previous.changeRate === changeRate) return state

    const dataset = structuredClone(state.dataset)
    const submittedAt = nowIso()
    const frozenVersion: ThresholdVersion = {
      id: `${thresholdId}-v${previous.version + 1}`,
      thresholdId,
      type: previous.type,
      warning,
      alarm,
      changeRate,
      unit: previous.unit,
      version: previous.version + 1,
      status: '生效中',
      submittedBy: '值班员 冯青',
      submittedAt,
      effectiveFrom: submittedAt,
      changeNote: changeNote.trim()
    }
    for (const version of dataset.thresholdVersions) if (version.thresholdId === thresholdId && version.status === '生效中') version.status = '已失效'
    dataset.thresholdVersions.push(frozenVersion)

    const scope = freezeScope(dataset, thresholdId, submittedAt)
    const job: RecomputeJob = {
      id: nextId('JOB'),
      targetVersionId: frozenVersion.id,
      triggeredBy: '阈值冻结',
      triggerSource: frozenVersion.id,
      scopeFrozenAt: submittedAt,
      affectedPointIds: scope.pointIds,
      affectedReadingIds: scope.readingIds,
      anomalyIds: scope.anomalyIds,
      status: '待受理',
      checkpoints: [],
      total: scope.readingIds.length,
      attempts: 0,
      lastError: '',
      rejectReason: '',
      createdAt: submittedAt,
      acceptedAt: '',
      completedAt: ''
    }
    dataset.recomputeJobs.unshift(job)

    // 同一阈值族未完成的在途任务一律被新版本取代，杜绝旧版本结果回流
    for (const old of dataset.recomputeJobs) {
      if (old.id === job.id) continue
      const target = dataset.thresholdVersions.find((item) => item.id === old.targetVersionId)
      if (target && target.thresholdId === thresholdId && UNFINISHED.includes(old.status) && !jobDone(old)) {
        old.status = '已被新版本取代'
        old.rejectReason = `阈值族${thresholdId}已冻结新版本${frozenVersion.id}，旧任务停止，不按旧版本返回结果。`
      }
    }

    // 旧读数保留原判，进入待重算
    const readingSet = new Set(scope.readingIds)
    for (const evaluation of dataset.evaluations) {
      if (readingSet.has(evaluation.readingId)) {
        // 当前判定与依据保持原判不动，仅进入待重算
        evaluation.recomputeStatus = '待重算'
        evaluation.jobId = ''
      }
    }

    // 受影响异常：按旧依据的处置方案先暂停批准
    for (const anomaly of dataset.anomalies) {
      if (scope.anomalyIds.includes(anomaly.id)) {
        anomaly.version += 1
        if (anomaly.status !== '已关闭') {
          anomaly.approvalHold = true
          anomaly.holdReason = `阈值已冻结为${frozenVersion.id}（V${frozenVersion.version}），受影响异常进入重算；按旧依据${anomaly.basisVersionId}的方案暂停批准。`
          dataset.audit.unshift(audit(anomaly.id, '审批暂停', '阈值版本服务', anomaly.holdReason))
        }
      }
    }

    dataset.audit.unshift(audit(frozenVersion.id, '冻结阈值版本', frozenVersion.submittedBy, `草稿提交即冻结：预警${warning}、报警${alarm}、变化率${changeRate}${previous.unit}；${frozenVersion.changeNote}`))
    dataset.audit.unshift(audit(previous.id, '旧阈值版本失效', frozenVersion.submittedBy, `${previous.id}（V${previous.version}）被${frozenVersion.id}取代，历史判定仍按该版本保留解释。`))
    dataset.audit.unshift(audit(thresholdId, '冻结重算范围', '阈值版本服务', `范围快照于${submittedAt}冻结：测点${scope.pointIds.length}个、读数${scope.readingIds.length}条、异常${scope.anomalyIds.length}个；旧读数保留原判并进入待重算。重算任务${job.id}。`))
    return { ...state, dataset }
  }),

  // 受理/恢复重算：同一异常并发只受理一次；逐读数推进断点；可注入失败后从断点继续
  on(TailingsActions.acceptRecompute, (state, { jobId }) => {
    const job = state.dataset.recomputeJobs.find((item) => item.id === jobId)
    if (!job || job.status === '已完成' || job.status === '已被新版本取代') return state

    const dataset = structuredClone(state.dataset)
    const work = dataset.recomputeJobs.find((item) => item.id === jobId)!
    const target = dataset.thresholdVersions.find((item) => item.id === work.targetVersionId)
    const pushAudit = (action: string, operator: string, detail: string) => dataset.audit.unshift(audit(work.id, action, operator, detail))

    if (!target || target.status !== '生效中') {
      work.status = '已被新版本取代'
      work.rejectReason = `目标版本${work.targetVersionId}已失效，不能按旧版本返回结果。`
      pushAudit('重算受理驳回', '重算服务', work.rejectReason)
      return { ...state, dataset }
    }

    // 并发去重：该任务覆盖的异常若已有其他在途任务，本次受理不进入
    const blocker = dataset.recomputeJobs.find((other) =>
      other.id !== work.id &&
      UNFINISHED.includes(other.status) &&
      !jobDone(other) &&
      work.anomalyIds.some((anomalyId) => jobTouchesAnomaly(dataset, other, anomalyId))
    )
    if (blocker) {
      work.rejectReason = `同一异常已有在途重算${blocker.id}（${blocker.status}），并发受理只允许一次。`
      pushAudit('重算受理驳回', '重算服务', work.rejectReason)
      return { ...state, dataset }
    }

    const resumed = work.status === '失败可恢复'
    work.attempts += 1
    work.status = '重算中'
    work.lastError = ''
    work.rejectReason = ''
    if (!work.acceptedAt) work.acceptedAt = nowIso()
    pushAudit(resumed ? '从断点恢复重算' : '受理重算', '重算服务', resumed
      ? `第${work.attempts}次受理，跳过已固化断点${work.checkpoints.length}/${work.total}，继续剩余读数。`
      : `重算任务受理，目标版本${target.id}，范围${work.total}条读数。`)

    const done = new Set(work.checkpoints.map((item) => item.readingId))
    const pending = dataset.readings
      .filter((reading) => work.affectedReadingIds.includes(reading.id) && !done.has(reading.id))
      .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt))

    let failConsumed = false
    for (const reading of pending) {
      const result = evaluateReading(reading, priorReading(dataset, reading.pointId, reading.capturedAt), target)
      // 评判结果先固化为断点；模拟“结果已持久化、下一步写入失败”的中断
      work.checkpoints.push({ readingId: reading.id, verdict: result.verdict, at: nowIso() })
      if (state.failNextRecompute && !failConsumed) {
        failConsumed = true
        work.status = '失败可恢复'
        work.lastError = `读数${reading.id}之后的结果提交失败（模拟中断），已固化断点${work.checkpoints.length}/${work.total}，恢复时从下一读数继续。`
        pushAudit('重算失败中断', '重算服务', work.lastError)
        return { ...state, dataset, failNextRecompute: false }
      }
    }

    if (jobDone(work)) {
      pushAudit('断点全部处理完成', '重算服务', `${work.checkpoints.length}/${work.total}条读数评判完毕，等待固化：固化时再次校验目标版本仍生效。`)
    }
    return { ...state, dataset }
  }),

  // 固化重算结果：目标版本失效则驳回；成功后读数换据、异常挂起待负责人确认
  on(TailingsActions.finalizeRecompute, (state, { jobId }) => {
    const job = state.dataset.recomputeJobs.find((item) => item.id === jobId)
    if (!job || job.status === '已完成' || job.status === '已被新版本取代') return state

    const dataset = structuredClone(state.dataset)
    const work = dataset.recomputeJobs.find((item) => item.id === jobId)!
    const target = dataset.thresholdVersions.find((item) => item.id === work.targetVersionId)
    const pushAudit = (action: string, detail: string) => dataset.audit.unshift(audit(work.id, action, '重算服务', detail))

    if (!jobDone(work)) {
      pushAudit('重算固化驳回', `仍有${work.total - work.checkpoints.length}条读数未形成断点，需先受理或从断点恢复，不能提前返回结果。`)
      return { ...state, dataset }
    }
    if (!target || target.status !== '生效中') {
      work.status = '已被新版本取代'
      work.rejectReason = `固化时发现目标版本${work.targetVersionId}已失效，丢弃本次结果，不按旧版本返回。`
      pushAudit('重算固化驳回', work.rejectReason)
      return { ...state, dataset }
    }

    const verdictOf = new Map(work.checkpoints.map((item) => [item.readingId, item.verdict]))
    for (const readingId of work.affectedReadingIds) {
      let evaluation = dataset.evaluations.find((item) => item.readingId === readingId)
      const verdict = verdictOf.get(readingId) ?? '正常'
      if (!evaluation) {
        evaluation = { readingId, originalVerdict: verdict, originalBasisVersionId: target.id, originalEvaluatedAt: nowIso(), currentVerdict: verdict, basisVersionId: target.id, recomputeStatus: '已重算', jobId: work.id, evaluatedAt: nowIso() }
        dataset.evaluations.push(evaluation)
      } else {
        evaluation.currentVerdict = verdict
        evaluation.basisVersionId = target.id
        evaluation.recomputeStatus = '已重算'
        evaluation.jobId = work.id
        evaluation.evaluatedAt = nowIso()
      }
    }

    // 仅形成重算结论，不自动改判；负责人确认后异常才换据
    for (const anomalyId of work.anomalyIds) {
      const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
      if (!anomaly) continue
      const trigger = dataset.readings.find((item) => item.id === anomaly.triggerReadingId)
      if (!trigger) continue
      const result = evaluateReading(trigger, priorReading(dataset, trigger.pointId, trigger.capturedAt), target)
      const recomputedSeverity = severityFor(result)
      const priorSeverity = anomaly.severity
      const summary = `${result.summary}；触发读数${trigger.id}判定为${result.verdict}。`
      dataset.conclusions.unshift({
        id: nextId('CON'),
        anomalyId: anomaly.id,
        jobId: work.id,
        basisVersionId: target.id,
        triggerVerdict: result.verdict,
        priorSeverity,
        recomputedSeverity,
        basisSummary: summary,
        changed: priorSeverity !== recomputedSeverity || anomaly.basisVersionId !== target.id,
        confirmedBy: '',
        confirmedAt: '',
        createdAt: nowIso()
      })
      anomaly.version += 1
      if (anomaly.status !== '已关闭') {
        anomaly.approvalHold = true
        anomaly.holdReason = `重算${work.id}已按${target.id}完成，结论待负责人确认；确认前处置方案继续暂停批准。`
      }
    }

    work.status = '已完成'
    work.completedAt = nowIso()
    work.lastError = ''
    syncPointStatuses(dataset)
    pushAudit('重算完成', `全部结果已按目标版本${target.id}固化，受影响异常${work.anomalyIds.length}个；异常原判保留，新结论待负责人确认。`)
    return { ...state, dataset }
  }),

  on(TailingsActions.toggleFailNextRecompute, (state) => ({ ...state, failNextRecompute: !state.failNextRecompute })),

  // 负责人确认重算结论：异常换据、解除暂停、方案按新依据继续
  on(TailingsActions.confirmRecomputeConclusion, (state, { conclusionId }) => {
    const conclusion = state.dataset.conclusions.find((item) => item.id === conclusionId)
    if (!conclusion || conclusion.confirmedBy) return state
    const dataset = structuredClone(state.dataset)
    const live = dataset.conclusions.find((item) => item.id === conclusionId)!
    const anomaly = dataset.anomalies.find((item) => item.id === conclusion.anomalyId)
    if (!anomaly) return state
    const target = dataset.thresholdVersions.find((item) => item.id === conclusion.basisVersionId)
    if (!target || target.status !== '生效中') {
      dataset.audit.unshift(audit(anomaly.id, '重算确认驳回', '负责人 何清', `结论依据版本${conclusion.basisVersionId}已失效，需按最新版本重新重算。`))
      return { ...state, dataset }
    }

    const priorBasis = anomaly.basisVersionId
    anomaly.severity = conclusion.recomputedSeverity
    anomaly.basisVersionId = conclusion.basisVersionId
    anomaly.basisHistory.unshift({
      basisVersionId: conclusion.basisVersionId,
      severity: conclusion.recomputedSeverity,
      summary: live.basisSummary,
      changedAt: nowIso(),
      changedBy: '负责人 何清'
    })
    anomaly.approvalHold = false
    anomaly.holdReason = ''
    anomaly.version += 1
    live.confirmedBy = '负责人 何清'
    live.confirmedAt = nowIso()
    if (!anomaly.plan.approvedBy) anomaly.plan.basisVersionId = conclusion.basisVersionId

    dataset.audit.unshift(audit(anomaly.id, '确认重算结论', '负责人 何清', `依据${priorBasis}→${conclusion.basisVersionId}，级别${conclusion.priorSeverity}→${conclusion.recomputedSeverity}；异常改按新依据解释。`))
    if (!anomaly.plan.approvedBy) {
      dataset.audit.unshift(audit(anomaly.plan.id, '处置方案换据继续', '负责人 何清', `方案依据由${priorBasis}更新为${conclusion.basisVersionId}，解除审批暂停，可继续会签。`))
    }
    return { ...state, dataset }
  }),

  on(TailingsActions.submitFieldReview, (state, { anomalyId, review }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || !review.observed || !review.evidence || !review.reassessment) return state
    anomaly.fieldReviews.unshift({ ...review, version: anomaly.fieldReviews.length + 1 })
    anomaly.status = '原因调查中'
    anomaly.version += 1
    dataset.audit.unshift(audit(anomalyId, '提交现场复核', review.inspector, `依据版本${anomaly.basisVersionId}：${review.reassessment}`))
    return { ...state, dataset }
  }),
  on(TailingsActions.addExpertOpinion, (state, { anomalyId, opinion }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || !opinion.content) return state
    anomaly.opinions.unshift(opinion)
    anomaly.version += 1
    dataset.audit.unshift(audit(anomalyId, '补充专业意见', opinion.specialist, `${opinion.conclusion}：${opinion.content}`))
    return { ...state, dataset }
  }),
  on(TailingsActions.saveDispositionPlan, (state, { anomalyId, plan }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || !plan.owner || !plan.deadline || !plan.conditions) return state
    anomaly.plan = { ...plan, basisVersionId: anomaly.basisVersionId, approvedBy: '', approvedAt: '' }
    anomaly.status = '待负责人审批'
    anomaly.version += 1
    dataset.audit.unshift(audit(anomalyId, '提交处置方案', '当前用户', `${plan.action}，责任方${plan.owner}，方案依据冻结为${anomaly.basisVersionId}${anomaly.approvalHold ? '；当前处于审批暂停，需先确认重算结论' : ''}`))
    return { ...state, dataset }
  }),
  on(TailingsActions.approvePlan, (state, { anomalyId, approver, note }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly) return state
    const pause = (detail: string) => {
      anomaly.approvalHold = true
      if (!anomaly.holdReason) anomaly.holdReason = detail
      dataset.audit.unshift(audit(anomalyId, '审批暂停', approver, detail))
      return { ...state, dataset }
    }

    if (anomaly.severity === '重大' && !anomaly.plan.emergencyLinked) return state
    if (anomaly.approvalHold) return pause(`按依据${anomaly.plan.basisVersionId}的方案暂停批准：${anomaly.holdReason || '阈值已更新，需先完成重算并由负责人确认。'}`)
    if (anomaly.plan.basisVersionId !== anomaly.basisVersionId) {
      return pause(`方案依据${anomaly.plan.basisVersionId}与异常当前依据${anomaly.basisVersionId}不一致，暂停批准。`)
    }
    const point = dataset.points.find((item) => item.id === anomaly.pointId)
    const active = point ? activeVersion(dataset.thresholdVersions, point.thresholdId) : undefined
    if (active && anomaly.basisVersionId !== active.id) {
      return pause(`阈值已更新为${active.id}，受影响异常须先重算并确认；本次不按旧依据${anomaly.basisVersionId}批准。`)
    }

    // 在途或待确认重算覆盖该异常：一律暂停，且不重复受理
    const related = dataset.recomputeJobs.filter((job) => jobTouchesAnomaly(dataset, job, anomalyId))
    const pendingJob = related.find((job) => job.status === '待受理')
    const runningJob = related.find((job) => (job.status === '重算中' || job.status === '失败可恢复') && !jobDone(job))
    const unconfirmed = related.some((job) => job.status === '已完成' && dataset.conclusions.some((conclusion) => conclusion.jobId === job.id && conclusion.anomalyId === anomalyId && !conclusion.confirmedBy))
    if (pendingJob) return pause(`受影响异常的重算${pendingJob.id}尚未受理，审批暂停；不重复受理同一异常的重算。`)
    if (runningJob) return pause(`受影响异常的重算${runningJob.id}尚未完成（${runningJob.status}），审批暂停。`)
    if (unconfirmed) return pause('重算已完成但结论尚未经负责人确认，审批暂停。')

    // 兜底：阈值版本更新但尚无重算任务时，审批即触发重算并暂停
    if (point && active && anomaly.basisVersionId !== active.id) {
      const scope = freezeScope(dataset, point.thresholdId, nowIso())
      const job: RecomputeJob = {
        id: nextId('JOB'), targetVersionId: active.id, triggeredBy: '审批触发', triggerSource: anomalyId, scopeFrozenAt: nowIso(),
        affectedPointIds: scope.pointIds, affectedReadingIds: scope.readingIds, anomalyIds: scope.anomalyIds,
        status: '待受理', checkpoints: [], total: scope.readingIds.length, attempts: 0, lastError: '', rejectReason: '',
        createdAt: nowIso(), acceptedAt: '', completedAt: ''
      }
      dataset.recomputeJobs.unshift(job)
      return pause(`审批时发现阈值已更新为${active.id}，已触发重算${job.id}，方案按旧依据暂停批准。`)
    }

    anomaly.plan.approvedBy = approver
    anomaly.plan.approvedAt = nowIso()
    anomaly.version += 1
    dataset.audit.unshift(audit(anomalyId, '审批处置方案', approver, `${note || '同意执行'}；会签依据${anomaly.plan.basisVersionId}。`))
    return { ...state, dataset }
  }),
  on(TailingsActions.closeAnomaly, (state, { anomalyId, note }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || !anomaly.plan.approvedBy || !anomaly.fieldReviews.length || !note.trim()) return state
    if (anomaly.approvalHold) {
      dataset.audit.unshift(audit(anomalyId, '关闭暂停', anomaly.plan.approvedBy, `重算结论未确认，依据版本未定，不能关闭：${anomaly.holdReason}`))
      return { ...state, dataset }
    }
    anomaly.status = '已关闭'
    anomaly.closedAt = nowIso()
    anomaly.version += 1
    dataset.audit.unshift(audit(anomalyId, '关闭异常', anomaly.plan.approvedBy, `${note} 关闭依据${anomaly.basisVersionId}。`))
    return { ...state, dataset }
  }),
  on(TailingsActions.createEmergencyLink, (state, { anomalyId, note }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly) return state
    anomaly.plan.emergencyLinked = true
    anomaly.status = '应急联动'
    anomaly.version += 1
    dataset.audit.unshift(audit(anomalyId, '启动应急联动', '值班负责人', note))
    return { ...state, dataset }
  }),
  on(TailingsActions.selectAnomaly, (state, { anomalyId }) => ({ ...state, selectedAnomalyId: anomalyId })),
  on(TailingsActions.updateKeyword, (state, { keyword }) => ({ ...state, keyword })),
  on(TailingsActions.updateStatus, (state, { status }) => ({ ...state, status: status as TailingsState['status'] })),

  // 导出审阅包：固定阈值版本、异常关联与未完成重算
  on(TailingsActions.exportReviewPackage, (state, { label }) => {
    const dataset = structuredClone(state.dataset)
    const pinned: PinnedVersion[] = dataset.thresholdVersions.map((item) => ({
      thresholdId: item.thresholdId, thresholdType: item.type, versionId: item.id, version: item.version, status: item.status
    }))
    const links: PackageAnomalyLink[] = dataset.anomalies.map((anomaly) => {
      const triggerEvaluation = dataset.evaluations.find((item) => item.readingId === anomaly.triggerReadingId)
      const point = dataset.points.find((item) => item.id === anomaly.pointId)
      return {
        anomalyId: anomaly.id,
        pointId: anomaly.pointId,
        triggerReadingId: anomaly.triggerReadingId,
        status: anomaly.status,
        originalBasisVersionId: triggerEvaluation?.originalBasisVersionId ?? '',
        currentBasisVersionId: anomaly.basisVersionId,
        planBasisVersionId: anomaly.plan.basisVersionId,
        jobIds: dataset.recomputeJobs.filter((job) => point && job.affectedPointIds.includes(point.id)).map((job) => job.id),
        conclusionVersionId: dataset.conclusions.find((item) => item.anomalyId === anomaly.id)?.basisVersionId ?? '',
        approvalHold: anomaly.approvalHold
      }
    })
    const unfinished = dataset.recomputeJobs
      .filter((job) => job.status !== '已完成' && job.status !== '已被新版本取代')
      .map((job) => ({ jobId: job.id, targetVersionId: job.targetVersionId, status: job.status, done: job.checkpoints.length, total: job.total, attempts: job.attempts, lastError: job.lastError }))

    const pkg: ReviewPackage = {
      id: nextId('PKG'),
      label: label.trim() || `审阅包 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
      exportedAt: nowIso(),
      exportedBy: '当前用户',
      pinnedThresholdVersions: pinned,
      anomalyLinks: links,
      unfinishedRecomputes: unfinished,
      dataset
    }
    dataset.reviewPackages.unshift(pkg)
    dataset.audit.unshift(audit(pkg.id, '导出审阅包', pkg.exportedBy, `固定阈值版本${pinned.length}个、异常关联${links.length}条、未完成重算${unfinished.length}个；重新打开按同一版本解释。`))
    return { ...state, dataset }
  }),
  on(TailingsActions.reopenReviewPackage, (state, { packageId }) => {
    const pkg = state.dataset.reviewPackages.find((item) => item.id === packageId)
    if (!pkg) return state
    return { ...state, viewingPackageId: packageId, selectedAnomalyId: pkg.dataset.anomalies[0]?.id ?? state.selectedAnomalyId }
  }),
  on(TailingsActions.closeReviewPackage, (state) => ({ ...state, viewingPackageId: '', selectedAnomalyId: state.dataset.anomalies[0]?.id ?? '' })),

  on(TailingsActions.addAudit, (state, { entry }) => ({ ...state, dataset: { ...state.dataset, audit: [entry, ...state.dataset.audit] } })),
  on(TailingsActions.resetDemo, () => ({ ...initialTailingsState, dataset: structuredClone(seedDataset), selectedAnomalyId: seedDataset.anomalies[0].id }))
)
