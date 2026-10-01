import type {
  Anomaly,
  AuditEntry,
  DispositionPlan,
  MonitoringPoint,
  PointStatus,
  ReadingVerdict,
  RecalcJob,
  ReviewPackage,
  TailingsDataset,
  ThresholdVersion
} from './models'

export interface WorkflowContext {
  now: string
  operator: string
  nextId: (prefix: string) => string
}

export interface ThresholdDraftInput {
  warning: number
  alarm: number
  changeRate: number
  note: string
}

const pushAudit = (dataset: TailingsDataset, ctx: WorkflowContext, entityId: string, action: string, detail: string, operator?: string): void => {
  dataset.audit.unshift({ id: ctx.nextId('AUD'), entityId, action, operator: operator ?? ctx.operator, detail, createdAt: ctx.now })
}

export const evaluateReading = (value: number, version: Pick<ThresholdVersion, 'warning' | 'alarm'>): PointStatus =>
  value >= version.alarm ? '异常' : value >= version.warning ? '预警' : '正常'

export const effectiveVersionOf = (dataset: TailingsDataset, thresholdId: string): ThresholdVersion | undefined =>
  dataset.thresholdVersions.find((version) => version.thresholdId === thresholdId && version.status === '已生效')

export const versionNoOf = (dataset: TailingsDataset, versionId: string): number =>
  dataset.thresholdVersions.find((version) => version.id === versionId)?.version ?? 0

export const currentVerdictOf = (dataset: TailingsDataset, readingId: string): ReadingVerdict | undefined =>
  dataset.verdicts.find((verdict) => verdict.readingId === readingId && !verdict.superseded)

export const activeRecalcJobOf = (dataset: TailingsDataset, anomalyId: string): RecalcJob | undefined =>
  dataset.recalcJobs.find((job) => job.anomalyId === anomalyId && job.status === '进行中')

const reject = (dataset: TailingsDataset, ctx: WorkflowContext, entityId: string, action: string, reason: string): string => {
  pushAudit(dataset, ctx, entityId, action, reason)
  return reason
}

/** 阈值草稿提交：冻结为新适用版本，旧读数保留原判并进入待重算，受影响异常受理重算，旧依据方案暂停批准 */
export function submitThresholdDraft(dataset: TailingsDataset, thresholdId: string, draft: ThresholdDraftInput, ctx: WorkflowContext): string {
  const threshold = dataset.thresholds.find((item) => item.id === thresholdId)
  if (!threshold) return '阈值不存在'
  if (!(draft.alarm > draft.warning)) return reject(dataset, ctx, thresholdId, '草稿被拒绝', `报警值${draft.alarm}必须大于预警值${draft.warning}`)
  const previous = effectiveVersionOf(dataset, thresholdId)
  const nextVersionNo = Math.max(0, ...dataset.thresholdVersions.filter((version) => version.thresholdId === thresholdId).map((version) => version.version)) + 1
  const version: ThresholdVersion = {
    id: ctx.nextId('TV'), thresholdId, version: nextVersionNo,
    warning: draft.warning, alarm: draft.alarm, changeRate: draft.changeRate, unit: threshold.unit,
    status: '已生效', submittedBy: ctx.operator, frozenAt: ctx.now, effectiveAt: ctx.now,
    supersedesVersionId: previous?.id ?? '', note: draft.note
  }
  dataset.thresholdVersions.push(version)
  if (previous) previous.status = '已废止'
  threshold.warning = draft.warning
  threshold.alarm = draft.alarm
  threshold.changeRate = draft.changeRate
  threshold.version = nextVersionNo
  threshold.activeVersionId = version.id
  pushAudit(dataset, ctx, thresholdId, '冻结阈值版本',
    `提交即冻结：V${nextVersionNo}（预警${draft.warning}、报警${draft.alarm}、速率${draft.changeRate}${threshold.unit}），替代${previous ? `V${previous.version}` : '无'}；旧读数保留原判并进入待重算${draft.note ? `；说明：${draft.note}` : ''}`)

  const points = dataset.points.filter((point) => point.thresholdId === thresholdId)
  const pointIds = new Set(points.map((point) => point.id))
  // 旧读数保留原判（不 supersede、不改写结论），仅标记待重算
  for (const verdict of dataset.verdicts) {
    if (!pointIds.has(verdict.pointId) || verdict.superseded || verdict.thresholdVersionId === version.id) continue
    verdict.pendingRecalc = true
  }
  const scopedPoints = new Set<string>()
  for (const anomaly of dataset.anomalies.filter((item) => pointIds.has(item.pointId) && item.status !== '已关闭')) {
    anomaly.recalcState = '待重算'
    anomaly.version += 1
    if (createRecalcJob(dataset, version, previous, ctx, anomaly)) scopedPoints.add(anomaly.pointId)
    // 处置方案审批期间阈值更新：按旧依据的方案先暂停批准
    if (anomaly.plan && !anomaly.plan.approvedBy && anomaly.plan.basisVersionId && anomaly.plan.basisVersionId !== version.id) {
      anomaly.plan.approvalHold = true
      anomaly.plan.holdReason = `阈值已冻结V${nextVersionNo}，方案依据V${versionNoOf(dataset, anomaly.plan.basisVersionId)}，需负责人确认后继续批准`
      pushAudit(dataset, ctx, anomaly.id, '暂停批准', anomaly.plan.holdReason)
    }
  }
  // 无异常在办的测点同样有点级重算任务，保证旧读数全部进入重算范围
  for (const point of points) {
    if (scopedPoints.has(point.id)) continue
    createRecalcJob(dataset, version, previous, ctx, undefined, point)
  }
  return ''
}

function createRecalcJob(dataset: TailingsDataset, target: ThresholdVersion, base: ThresholdVersion | undefined, ctx: WorkflowContext, anomaly?: Anomaly, point?: MonitoringPoint): RecalcJob | undefined {
  const pointId = anomaly?.pointId ?? point?.id ?? ''
  const scope = dataset.verdicts
    .filter((verdict) => verdict.pointId === pointId && !verdict.superseded && verdict.pendingRecalc)
    .map((verdict) => verdict.readingId)
  const capturedAt = new Map(dataset.readings.map((reading) => [reading.id, reading.capturedAt]))
  scope.sort((a, b) => (capturedAt.get(a) ?? '').localeCompare(capturedAt.get(b) ?? ''))
  if (!scope.length) return undefined
  const job: RecalcJob = {
    id: ctx.nextId('RC'), dedupKey: `${anomaly?.id || pointId}@${target.id}`,
    anomalyId: anomaly?.id ?? '', pointId,
    baseVersionId: base?.id ?? '', targetVersionId: target.id,
    scopeReadingIds: scope, processedReadingIds: [],
    status: '进行中', attempts: 1, lastError: '',
    createdBy: ctx.operator, createdAt: ctx.now, updatedAt: ctx.now, completedAt: ''
  }
  dataset.recalcJobs.unshift(job)
  if (anomaly) anomaly.recalcState = '重算中'
  pushAudit(dataset, ctx, anomaly?.id ?? pointId, '受理重算',
    `冻结重算范围${scope.length}条读数：${base ? `V${base.version}` : '—'} → V${target.version}（${target.id}），去重键${job.dedupKey}`)
  return job
}

/** 发起重算：同一异常对同一目标版本只受理一次；失败任务只能断点恢复；已完成结果不得按旧版本重放 */
export function requestRecalc(dataset: TailingsDataset, anomalyId: string, ctx: WorkflowContext): string {
  const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
  if (!anomaly) return '异常不存在'
  const point = dataset.points.find((item) => item.id === anomaly.pointId)
  const target = point ? effectiveVersionOf(dataset, point.thresholdId) : undefined
  if (!point || !target) return '测点或生效阈值版本缺失'
  const existing = dataset.recalcJobs.find((job) => job.dedupKey === `${anomaly.id}@${target.id}`)
  if (existing) {
    const reason = existing.status === '进行中'
      ? `同一异常的重算已受理（${existing.id}），并发请求被拒绝`
      : existing.status === '失败'
        ? `重算${existing.id}处于失败态，应从断点恢复而非重新受理`
        : `重算${existing.id}已按V${versionNoOf(dataset, existing.targetVersionId)}完成，结果不得按旧版本重放`
    return reject(dataset, ctx, anomalyId, '重算请求被拒绝', reason)
  }
  const base = dataset.thresholdVersions.find((version) => version.id === anomaly.basisVersionId)
  const job = createRecalcJob(dataset, target, base, ctx, anomaly)
  if (!job) return reject(dataset, ctx, anomalyId, '重算请求被拒绝', '该测点没有待重算读数，现行判定已是最新版本')
  return ''
}

/** 重算引擎节拍：每个进行中任务处理一条读数并推进断点；处理完即按目标版本盖章完成 */
export function recalcTick(dataset: TailingsDataset, ctx: WorkflowContext): void {
  for (const job of dataset.recalcJobs.filter((item) => item.status === '进行中')) stepJob(dataset, job, ctx)
}

function stepJob(dataset: TailingsDataset, job: RecalcJob, ctx: WorkflowContext): void {
  const target = dataset.thresholdVersions.find((version) => version.id === job.targetVersionId)
  if (!target) {
    job.status = '失败'
    job.lastError = '目标阈值版本缺失'
    job.updatedAt = ctx.now
    return
  }
  const nextReadingId = job.scopeReadingIds.find((id) => !job.processedReadingIds.includes(id))
  if (nextReadingId === undefined) {
    completeJob(dataset, job, ctx)
    return
  }
  const reading = dataset.readings.find((item) => item.id === nextReadingId)
  if (reading) {
    const previous = currentVerdictOf(dataset, nextReadingId)
    if (previous) {
      previous.superseded = true
      previous.pendingRecalc = false
    }
    dataset.verdicts.push({
      id: ctx.nextId('VJ'), readingId: reading.id, pointId: reading.pointId,
      thresholdVersionId: target.id, verdict: evaluateReading(reading.value, target),
      judgedAt: ctx.now, jobId: job.id, pendingRecalc: false, superseded: false
    })
  }
  job.processedReadingIds.push(nextReadingId)
  job.updatedAt = ctx.now
  if (job.processedReadingIds.length >= job.scopeReadingIds.length) completeJob(dataset, job, ctx)
}

function completeJob(dataset: TailingsDataset, job: RecalcJob, ctx: WorkflowContext): void {
  job.status = '已完成'
  job.completedAt = ctx.now
  job.updatedAt = ctx.now
  const target = dataset.thresholdVersions.find((version) => version.id === job.targetVersionId)
  const point = dataset.points.find((item) => item.id === job.pointId)
  if (point) {
    const latest = dataset.readings.filter((reading) => reading.pointId === point.id).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0]
    const verdict = latest ? currentVerdictOf(dataset, latest.id) : undefined
    if (verdict) point.status = verdict.verdict
  }
  const anomaly = dataset.anomalies.find((item) => item.id === job.anomalyId)
  if (anomaly && target) {
    anomaly.basisVersionId = target.id
    anomaly.recalcState = '已按新版重算'
    anomaly.version += 1
    const trigger = currentVerdictOf(dataset, anomaly.triggerReadingId)
    pushAudit(dataset, ctx, anomaly.id, '重算完成',
      `已按V${target.version}（${target.id}）重算${job.processedReadingIds.length}条读数，判据版本更新为V${target.version}${trigger ? `，触发读数新判定：${trigger.verdict}` : ''}；原判保留为历史版本`, '重算引擎')
  } else {
    pushAudit(dataset, ctx, job.pointId, '重算完成', `点级重算按V${target?.version ?? '?'}完成${job.processedReadingIds.length}条读数`, '重算引擎')
  }
}

/** 模拟故障：任务置失败，断点（已处理读数）保留 */
export function interruptRecalc(dataset: TailingsDataset, jobId: string, error: string, ctx: WorkflowContext): string {
  const job = dataset.recalcJobs.find((item) => item.id === jobId)
  if (!job || job.status !== '进行中') return '仅进行中的重算可中断'
  job.status = '失败'
  job.lastError = error
  job.updatedAt = ctx.now
  const anomaly = dataset.anomalies.find((item) => item.id === job.anomalyId)
  if (anomaly) anomaly.recalcState = '待重算'
  pushAudit(dataset, ctx, job.anomalyId || job.pointId, '重算中断', `${error}；断点保留：已处理${job.processedReadingIds.length}/${job.scopeReadingIds.length}条读数`)
  return ''
}

/** 断点恢复：仅失败任务可恢复，从已处理读数之后继续；进行中/已完成任务拒绝重复受理 */
export function resumeRecalc(dataset: TailingsDataset, jobId: string, ctx: WorkflowContext): string {
  const job = dataset.recalcJobs.find((item) => item.id === jobId)
  if (!job) return '重算任务不存在'
  if (job.status === '已完成') {
    return reject(dataset, ctx, job.anomalyId || job.pointId, '恢复请求被拒绝',
      `重算${job.id}已按V${versionNoOf(dataset, job.targetVersionId)}完成，结果已固化，不得按旧版本重放或重复受理`)
  }
  if (job.status === '进行中') {
    return reject(dataset, ctx, job.anomalyId || job.pointId, '恢复请求被拒绝', `重算${job.id}正在进行，重复受理被拒绝`)
  }
  job.status = '进行中'
  job.attempts += 1
  job.lastError = ''
  job.updatedAt = ctx.now
  const anomaly = dataset.anomalies.find((item) => item.id === job.anomalyId)
  if (anomaly) anomaly.recalcState = '重算中'
  pushAudit(dataset, ctx, job.anomalyId || job.pointId, '断点恢复',
    `第${job.attempts}次尝试，从断点继续：已处理${job.processedReadingIds.length}/${job.scopeReadingIds.length}条，剩余读数按目标版本V${versionNoOf(dataset, job.targetVersionId)}重算`)
  return ''
}

/** 提交处置方案：记录方案依据的阈值版本 */
export function saveDispositionPlan(dataset: TailingsDataset, anomalyId: string, plan: DispositionPlan, ctx: WorkflowContext): string {
  const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
  if (!anomaly || !plan.owner || !plan.deadline || !plan.conditions) return '方案要素不完整'
  const point = dataset.points.find((item) => item.id === anomaly.pointId)
  const effective = point ? effectiveVersionOf(dataset, point.thresholdId) : undefined
  anomaly.plan = { ...plan, basisVersionId: effective?.id ?? '', approvalHold: false, holdReason: '', confirmedBy: '', confirmedAt: '', approvedBy: '', approvedAt: '' }
  anomaly.status = '待负责人审批'
  anomaly.version += 1
  pushAudit(dataset, ctx, anomalyId, '提交处置方案', `${plan.action}，责任方${plan.owner}，依据阈值V${effective?.version ?? '?'}（${effective?.id ?? '无'}）`)
  return ''
}

/** 负责人确认：知悉阈值更新，解除暂停批准 */
export function confirmPlanBasis(dataset: TailingsDataset, anomalyId: string, ctx: WorkflowContext): string {
  const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
  if (!anomaly) return '异常不存在'
  if (!anomaly.plan.approvalHold) return '方案未处于暂停批准状态'
  anomaly.plan.approvalHold = false
  anomaly.plan.confirmedBy = ctx.operator
  anomaly.plan.confirmedAt = ctx.now
  anomaly.version += 1
  pushAudit(dataset, ctx, anomalyId, '负责人确认', `已知悉阈值更新（${anomaly.plan.holdReason}），确认按现行流程继续审批`)
  return ''
}

/** 审批处置方案：旧依据未确认、重算进行中的一律暂停批准 */
export function approvePlan(dataset: TailingsDataset, anomalyId: string, approver: string, note: string, ctx: WorkflowContext): string {
  const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
  if (!anomaly) return '异常不存在'
  if (anomaly.severity === '重大' && !anomaly.plan.emergencyLinked) {
    return reject(dataset, ctx, anomalyId, '批准被拒绝', '重大异常未启动应急联动，不得批准')
  }
  if (anomaly.plan.approvalHold) {
    return reject(dataset, ctx, anomalyId, '批准暂停', `${anomaly.plan.holdReason}；需负责人确认后继续`)
  }
  const point = dataset.points.find((item) => item.id === anomaly.pointId)
  const effective = point ? effectiveVersionOf(dataset, point.thresholdId) : undefined
  if (effective && anomaly.plan.basisVersionId && anomaly.plan.basisVersionId !== effective.id && !anomaly.plan.confirmedBy) {
    anomaly.plan.approvalHold = true
    anomaly.plan.holdReason = `方案依据V${versionNoOf(dataset, anomaly.plan.basisVersionId)}已废止，现行版本V${effective.version}，需负责人确认后继续批准`
    return reject(dataset, ctx, anomalyId, '批准暂停', anomaly.plan.holdReason)
  }
  const running = activeRecalcJobOf(dataset, anomalyId)
  if (running) {
    return reject(dataset, ctx, anomalyId, '批准暂停', `重算${running.id}进行中（断点${running.processedReadingIds.length}/${running.scopeReadingIds.length}），完成后方可批准`)
  }
  anomaly.plan.approvedBy = approver
  anomaly.plan.approvedAt = ctx.now
  anomaly.version += 1
  pushAudit(dataset, ctx, anomalyId, '审批处置方案', note || '同意执行', approver)
  return ''
}

/** 生成审阅包：固定阈值版本、异常关联与未完成重算；条目按打包时的判据版本解释，重新打开不漂移 */
export function buildReviewPackage(dataset: TailingsDataset, anomalyIds: string[], ctx: WorkflowContext): ReviewPackage | string {
  const anomalies = dataset.anomalies.filter((item) => anomalyIds.includes(item.id))
  if (!anomalies.length) return '未选择异常'
  const pinned = new Map<string, ReviewPackage['pinnedVersions'][number]>()
  const entries = anomalies.map((anomaly) => {
    const basis = dataset.thresholdVersions.find((version) => version.id === anomaly.basisVersionId)
    const reading = dataset.readings.find((item) => item.id === anomaly.triggerReadingId)
    // 优先取该判据版本盖章的判定记录（含已 superseded 的原判），缺失时按固定版本重述
    const stamped = dataset.verdicts.find((verdict) => verdict.readingId === anomaly.triggerReadingId && verdict.thresholdVersionId === anomaly.basisVersionId)
    const verdict: PointStatus | '' = stamped?.verdict ?? (reading && basis ? evaluateReading(reading.value, basis) : '')
    if (basis) pinned.set(basis.id, { thresholdId: basis.thresholdId, versionId: basis.id, version: basis.version, warning: basis.warning, alarm: basis.alarm, unit: basis.unit })
    return {
      anomalyId: anomaly.id, title: anomaly.title, pointId: anomaly.pointId, status: anomaly.status,
      basisVersionId: anomaly.basisVersionId, basisVersion: basis?.version ?? 0,
      triggerReadingId: anomaly.triggerReadingId, observedValue: anomaly.observedValue, verdict,
      summary: basis
        ? `按${basis.thresholdId} V${basis.version}（预警${basis.warning}/报警${basis.alarm}${basis.unit}）解释：触发读数${reading ? `${reading.value} ${reading.unit}` : '缺失'}判定为${verdict || '未知'}${stamped ? '' : '（按固定版本重述）'}`
        : '判据版本缺失'
    }
  })
  const anomalyIdSet = new Set(anomalies.map((item) => item.id))
  const pointIdSet = new Set(anomalies.map((item) => item.pointId))
  const openRecalcJobs = dataset.recalcJobs
    .filter((job) => job.status !== '已完成' && (anomalyIdSet.has(job.anomalyId) || pointIdSet.has(job.pointId)))
    .map((job) => ({ jobId: job.id, anomalyId: job.anomalyId, pointId: job.pointId, targetVersionId: job.targetVersionId, status: job.status, processed: job.processedReadingIds.length, total: job.scopeReadingIds.length }))
  const pkg: ReviewPackage = {
    id: ctx.nextId('RP'), createdAt: ctx.now, createdBy: ctx.operator,
    pinnedVersions: [...pinned.values()], entries, openRecalcJobs
  }
  dataset.reviewPackages.unshift(pkg)
  pushAudit(dataset, ctx, pkg.id, '生成审阅包', `固定${pinned.size}个阈值版本、${entries.length}条异常关联、${openRecalcJobs.length}项未完成重算；重新打开仍按同一版本解释`)
  return pkg
}

/** 兼容旧快照：补齐追溯流程新增字段 */
export function normalizeDataset(dataset: TailingsDataset): TailingsDataset {
  dataset.thresholdVersions ??= []
  dataset.verdicts ??= []
  dataset.recalcJobs ??= []
  dataset.reviewPackages ??= []
  for (const threshold of dataset.thresholds) threshold.activeVersionId ??= effectiveVersionOf(dataset, threshold.id)?.id ?? ''
  for (const anomaly of dataset.anomalies) {
    anomaly.recalcState ??= '无需重算'
    if (anomaly.plan) {
      anomaly.plan.basisVersionId ??= ''
      anomaly.plan.approvalHold ??= false
      anomaly.plan.holdReason ??= ''
      anomaly.plan.confirmedBy ??= ''
      anomaly.plan.confirmedAt ??= ''
    }
  }
  return dataset
}
