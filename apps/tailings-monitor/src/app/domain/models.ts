export type MonitoringType = '位移' | '水位' | '渗流' | '降雨'
export type PointStatus = '正常' | '预警' | '异常'
export type AnomalyStatus = '待现场复核' | '原因调查中' | '待负责人审批' | '应急联动' | '已关闭'
export type Severity = '关注' | '较高' | '重大'
export type RecalcState = '无需重算' | '待重算' | '重算中' | '已按新版重算'
export type RecalcJobStatus = '进行中' | '失败' | '已完成'
export type ThresholdVersionStatus = '已生效' | '已废止'

export interface MonitoringPoint {
  id: string
  name: string
  zone: string
  type: MonitoringType
  longitude: number
  latitude: number
  status: PointStatus
  currentValue: number
  unit: string
  thresholdId: string
  lastInspectionAt: string
}

export interface Threshold {
  id: string
  type: MonitoringType
  warning: number
  alarm: number
  changeRate: number
  unit: string
  enabled: boolean
  version: number
  activeVersionId: string
}

/** 阈值版本：草稿提交即冻结，值不可再改，适用读数范围随之固定 */
export interface ThresholdVersion {
  id: string
  thresholdId: string
  version: number
  warning: number
  alarm: number
  changeRate: number
  unit: string
  status: ThresholdVersionStatus
  submittedBy: string
  frozenAt: string
  effectiveAt: string
  supersedesVersionId: string
  note: string
}

export interface RawReading {
  id: string
  pointId: string
  value: number
  unit: string
  capturedAt: string
  deviceId: string
  quality: '有效' | '可疑' | '无效'
}

/** 读数判定：按某一阈值版本盖章。旧判 superseded 后仍保留，作为原判依据 */
export interface ReadingVerdict {
  id: string
  readingId: string
  pointId: string
  thresholdVersionId: string
  verdict: PointStatus
  judgedAt: string
  jobId: string
  pendingRecalc: boolean
  superseded: boolean
}

/** 重算任务：dedupKey 保证同一异常对同一目标版本只受理一次；processedReadingIds 为断点 */
export interface RecalcJob {
  id: string
  dedupKey: string
  anomalyId: string
  pointId: string
  baseVersionId: string
  targetVersionId: string
  scopeReadingIds: string[]
  processedReadingIds: string[]
  status: RecalcJobStatus
  attempts: number
  lastError: string
  createdBy: string
  createdAt: string
  updatedAt: string
  completedAt: string
}

export interface ExpertOpinion {
  id: string
  specialist: string
  discipline: '坝体' | '水文' | '岩土' | '应急'
  content: string
  conclusion: '支持结论' | '提出异议' | '补充证据'
  createdAt: string
}

export interface FieldReview {
  id: string
  inspector: string
  arrivedAt: string
  observed: string
  evidence: string
  reassessment: string
  version: number
}

export interface DispositionPlan {
  id: string
  action: '加密监测' | '降低库水位' | '疏通排水' | '应急撤离准备' | '工程加固'
  owner: string
  deadline: string
  conditions: string
  emergencyLinked: boolean
  approvedBy: string
  approvedAt: string
  /** 方案依据的阈值版本；阈值更新后旧依据方案暂停批准 */
  basisVersionId: string
  approvalHold: boolean
  holdReason: string
  confirmedBy: string
  confirmedAt: string
}

export interface Anomaly {
  id: string
  pointId: string
  title: string
  severity: Severity
  status: AnomalyStatus
  openedAt: string
  owner: string
  triggerReadingId: string
  observedValue: string
  fieldReviews: FieldReview[]
  opinions: ExpertOpinion[]
  plan: DispositionPlan
  closedAt: string
  version: number
  /** 判据阈值版本：异常结论按此版本解释 */
  basisVersionId: string
  recalcState: RecalcState
}

/** 审阅包条目：打包时按固定判据版本解释，重新打开不随新版本漂移 */
export interface ReviewPackageEntry {
  anomalyId: string
  title: string
  pointId: string
  status: AnomalyStatus
  basisVersionId: string
  basisVersion: number
  triggerReadingId: string
  observedValue: string
  verdict: PointStatus | ''
  summary: string
}

export interface ReviewPackageJob {
  jobId: string
  anomalyId: string
  pointId: string
  targetVersionId: string
  status: RecalcJobStatus
  processed: number
  total: number
}

export interface ReviewPackage {
  id: string
  createdAt: string
  createdBy: string
  pinnedVersions: { thresholdId: string; versionId: string; version: number; warning: number; alarm: number; unit: string }[]
  entries: ReviewPackageEntry[]
  openRecalcJobs: ReviewPackageJob[]
}

export interface AuditEntry {
  id: string
  entityId: string
  action: string
  operator: string
  detail: string
  createdAt: string
}

export interface TailingsDataset {
  points: MonitoringPoint[]
  thresholds: Threshold[]
  thresholdVersions: ThresholdVersion[]
  readings: RawReading[]
  verdicts: ReadingVerdict[]
  anomalies: Anomaly[]
  recalcJobs: RecalcJob[]
  reviewPackages: ReviewPackage[]
  audit: AuditEntry[]
}
