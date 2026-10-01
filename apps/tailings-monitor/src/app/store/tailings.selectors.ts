import { createFeatureSelector, createSelector } from '@ngrx/store'
import type { TailingsState } from './tailings.reducer'

export const selectTailings = createFeatureSelector<TailingsState>('tailings')
export const selectDataset = createSelector(selectTailings, (state) => state.dataset)
export const selectPoints = createSelector(selectDataset, (dataset) => dataset.points)
export const selectAnomalies = createSelector(selectDataset, (dataset) => dataset.anomalies)
export const selectThresholds = createSelector(selectDataset, (dataset) => dataset.thresholds)
export const selectThresholdVersions = createSelector(selectDataset, (dataset) => dataset.thresholdVersions)
export const selectReadings = createSelector(selectDataset, (dataset) => dataset.readings)
export const selectVerdicts = createSelector(selectDataset, (dataset) => dataset.verdicts)
export const selectRecalcJobs = createSelector(selectDataset, (dataset) => dataset.recalcJobs)
export const selectReviewPackages = createSelector(selectDataset, (dataset) => dataset.reviewPackages)
export const selectNotice = createSelector(selectTailings, (state) => state.notice)
export const selectPendingVerdictCount = createSelector(selectVerdicts, (verdicts) => verdicts.filter((verdict) => !verdict.superseded && verdict.pendingRecalc).length)
export const selectOpenRecalcJobCount = createSelector(selectRecalcJobs, (jobs) => jobs.filter((job) => job.status !== '已完成').length)
export const selectSelectedAnomaly = createSelector(selectTailings, (state) => state.dataset.anomalies.find((item) => item.id === state.selectedAnomalyId) ?? state.dataset.anomalies[0])
export const selectFilteredAnomalies = createSelector(selectTailings, (state) => state.dataset.anomalies.filter((item) => {
  const point = state.dataset.points.find((value) => value.id === item.pointId)
  const text = `${item.id} ${item.title} ${item.owner} ${point?.name ?? ''}`.toLowerCase()
  return (!state.keyword || text.includes(state.keyword.toLowerCase())) && (state.status === '全部' || item.status === state.status)
}))
