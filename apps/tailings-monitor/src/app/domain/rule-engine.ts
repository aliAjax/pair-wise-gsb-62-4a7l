import type { Anomaly, RawReading, Severity, ThresholdVersion, Verdict } from '../domain'

export interface EvaluationResult {
  verdict: Verdict
  rate: number
  alarmBreached: boolean
  warningBreached: boolean
  rateBreached: boolean
  summary: string
}

const hoursBetween = (from: string, to: string): number => Math.max((Date.parse(to) - Date.parse(from)) / 3_600_000, 0.0001)

/** 按指定阈值版本对单条读数重放评判；变化率取同测点更早一条读数折算 */
export function evaluateReading(reading: RawReading, previous: RawReading | undefined, tv: ThresholdVersion): EvaluationResult {
  const warningBreached = reading.value >= tv.warning
  const alarmBreached = reading.value >= tv.alarm
  let rate = 0
  switch (tv.type) {
    case '位移':
      rate = previous ? Math.abs(reading.value - previous.value) / hoursBetween(previous.capturedAt, reading.capturedAt) * 24 : 0
      break
    case '水位':
      rate = previous ? Math.abs(reading.value - previous.value) / hoursBetween(previous.capturedAt, reading.capturedAt) : 0
      break
    default:
      rate = previous ? Math.abs(reading.value - previous.value) : 0
  }
  const rateBreached = rate > tv.changeRate
  const verdict: Verdict = alarmBreached || rateBreached ? '异常' : warningBreached ? '预警' : '正常'
  const basis = `依据${tv.id}：当前${reading.value}${tv.unit}，预警${tv.warning}、报警${tv.alarm}，变化率${rate.toFixed(2)}（限值${tv.changeRate}${tv.unit}）`
  return { verdict, rate: Number(rate.toFixed(2)), alarmBreached, warningBreached, rateBreached, summary: basis }
}

/** 触发读数的评判结论映射为异常级别：报警值突破为重大，其余异常/预警为较高 */
export function severityFor(result: EvaluationResult): Severity {
  if (result.verdict === '正常') return '关注'
  return result.alarmBreached ? '重大' : '较高'
}

/** 某时刻生效的阈值版本（已失效版本仍用于解释当时的历史读数） */
export function versionAt(versions: ThresholdVersion[], thresholdId: string, at: string): ThresholdVersion | undefined {
  return versions
    .filter((item) => item.thresholdId === thresholdId && Date.parse(item.effectiveFrom) <= Date.parse(at))
    .sort((a, b) => b.version - a.version)[0]
}

/** 当前生效版本 */
export function activeVersion(versions: ThresholdVersion[], thresholdId: string): ThresholdVersion | undefined {
  return versions.filter((item) => item.thresholdId === thresholdId && item.status === '生效中').sort((a, b) => b.version - a.version)[0]
}

export function versionLabel(tv: ThresholdVersion | undefined): string {
  return tv ? `${tv.id}（V${tv.version}）` : '无生效版本'
}

/** 阈值草稿冻结时圈定重算范围：生效时刻之前（含）同阈值族测点的全部读数 */
export function freezeScope(dataset: {
  points: { id: string; thresholdId: string }[]
  readings: RawReading[]
  anomalies: Anomaly[]
}, thresholdId: string, effectiveFrom: string): { pointIds: string[]; readingIds: string[]; anomalyIds: string[] } {
  const pointIds = dataset.points.filter((point) => point.thresholdId === thresholdId).map((point) => point.id)
  const pointSet = new Set(pointIds)
  const cutoff = Date.parse(effectiveFrom)
  const readingIds = dataset.readings
    .filter((reading) => pointSet.has(reading.pointId) && Date.parse(reading.capturedAt) <= cutoff)
    .map((reading) => reading.id)
  const anomalyIds = dataset.anomalies.filter((anomaly) => pointSet.has(anomaly.pointId)).map((anomaly) => anomaly.id)
  return { pointIds, readingIds, anomalyIds }
}
