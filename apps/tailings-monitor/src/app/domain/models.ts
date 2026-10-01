export type MonitoringType = '位移' | '水位' | '渗流' | '降雨'
export type PointStatus = '正常' | '预警' | '异常'
export type AnomalyStatus = '待现场复核' | '原因调查中' | '待负责人审批' | '应急联动' | '已关闭'
export type Severity = '关注' | '较高' | '重大'
export type Verdict = '正常' | '预警' | '异常'

/** 阈值版本状态：草稿提交后冻结为“生效中”，被新版本取代后为“已失效”，记录永不删除 */
export type ThresholdVersionStatus = '生效中' | '已失效'

/** 读数重算状态：原判保留，进入待重算；重算后只更新当前依据，原判仍可查 */
export type ReadingRecomputeStatus = '原判有效' | '待重算' | '重算中' | '已重算'

/** 重算任务状态机：待受理 → 重算中 → 已完成/失败可恢复；并发受理只允许一次 */
export type RecomputeJobStatus = '待受理' | '重算中' | '失败可恢复' | '已完成' | '已被新版本取代'

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

export interface ThresholdVersion {
  /** 版本实例ID，如 T-D-v5；审阅包按此ID固定解释依据 */
  id: string
  /** 阈值族ID，监测点始终引用阈值族，具体依据落到版本实例 */
  thresholdId: string
  type: MonitoringType
  warning: number
  alarm: number
  changeRate: number
  unit: string
  version: number
  status: ThresholdVersionStatus
  submittedBy: string
  submittedAt: string
  /** 生效时刻，重算范围只取该时刻之前（含）的原始读数 */
  effectiveFrom: string
  changeNote: string
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

/** 读数评判：原判与当前判据并排保留，任一结论都能追溯到具体阈值版本 */
export interface ReadingEvaluation {
  readingId: string
  /** 原始判定，永不覆盖 */
  originalVerdict: Verdict
  originalBasisVersionId: string
  originalEvaluatedAt: string
  /** 当前判定；待重算期间沿用原判，重算完成后才换据 */
  currentVerdict: Verdict
  basisVersionId: string
  recomputeStatus: ReadingRecomputeStatus
  /** 产出当前判定的最近一次重算任务 */
  jobId: string
  evaluatedAt: string
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

export interface BasisHistoryEntry {
  basisVersionId: string
  severity: Severity
  summary: string
  changedAt: string
  changedBy: string
}

export interface DispositionPlan {
  id: string
  action: '加密监测' | '降低库水位' | '疏通排水' | '应急撤离准备' | '工程加固'
  owner: string
  deadline: string
  conditions: string
  emergencyLinked: boolean
  /** 方案所依据的阈值版本，审批时必须与生效版本一致，否则暂停 */
  basisVersionId: string
  approvedBy: string
  approvedAt: string
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
  /** 当前解释该异常所使用的阈值版本，负责人确认重算结论后换据 */
  basisVersionId: string
  /** 依据变更链：旧依据不删除 */
  basisHistory: BasisHistoryEntry[]
  /** 依据阈值已更新、重算结论尚未确认时为 true，审批一律暂停 */
  approvalHold: boolean
  holdReason: string
  fieldReviews: FieldReview[]
  opinions: ExpertOpinion[]
  plan: DispositionPlan
  closedAt: string
  version: number
}

/** 重算任务：范围在触发时冻结，断点逐条保存，失败后从断点继续 */
export interface RecomputeJob {
  id: string
  targetVersionId: string
  triggeredBy: '阈值冻结' | '审批触发'
  triggerSource: string
  /** 范围冻结时刻及快照，受理晚于冻结也不能改变范围 */
  scopeFrozenAt: string
  affectedPointIds: string[]
  affectedReadingIds: string[]
  anomalyIds: string[]
  status: RecomputeJobStatus
  /** 已完成的读数断点，恢复时跳过这些读数 */
  checkpoints: { readingId: string; verdict: Verdict; at: string }[]
  total: number
  attempts: number
  lastError: string
  rejectReason: string
  createdAt: string
  acceptedAt: string
  completedAt: string
}

/** 异常级重算结论：先给出、不自动改判，负责人确认后异常才换据 */
export interface RecomputeConclusion {
  id: string
  anomalyId: string
  jobId: string
  basisVersionId: string
  triggerVerdict: Verdict
  priorSeverity: Severity
  recomputedSeverity: Severity
  basisSummary: string
  changed: boolean
  confirmedBy: string
  confirmedAt: string
  createdAt: string
}

export interface AuditEntry {
  id: string
  entityId: string
  action: string
  operator: string
  detail: string
  createdAt: string
}

export interface PinnedVersion {
  thresholdId: string
  thresholdType: MonitoringType
  versionId: string
  version: number
  status: ThresholdVersionStatus
}

export interface PackageAnomalyLink {
  anomalyId: string
  pointId: string
  triggerReadingId: string
  status: AnomalyStatus
  originalBasisVersionId: string
  currentBasisVersionId: string
  planBasisVersionId: string
  jobIds: string[]
  conclusionVersionId: string
  approvalHold: boolean
}

export interface PackageUnfinishedJob {
  jobId: string
  targetVersionId: string
  status: RecomputeJobStatus
  done: number
  total: number
  attempts: number
  lastError: string
}

/** 审阅包：自包含快照，重新打开时仍按包内固定的版本解释全部内容 */
export interface ReviewPackage {
  id: string
  label: string
  exportedAt: string
  exportedBy: string
  pinnedThresholdVersions: PinnedVersion[]
  anomalyLinks: PackageAnomalyLink[]
  unfinishedRecomputes: PackageUnfinishedJob[]
  dataset: TailingsDataset
}

export interface TailingsDataset {
  points: MonitoringPoint[]
  thresholdVersions: ThresholdVersion[]
  readings: RawReading[]
  evaluations: ReadingEvaluation[]
  anomalies: Anomaly[]
  recomputeJobs: RecomputeJob[]
  conclusions: RecomputeConclusion[]
  reviewPackages: ReviewPackage[]
  audit: AuditEntry[]
}
