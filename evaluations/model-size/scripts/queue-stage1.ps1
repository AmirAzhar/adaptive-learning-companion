$ErrorActionPreference = 'Stop'
$evaluationRoot = Join-Path $PSScriptRoot '../../../data/evaluation'
$progressPath = Join-Path $evaluationRoot 'experiments/model-size-pilot/progress.json'
$manifestPath = Join-Path $evaluationRoot 'corpus-manifest.json'
$progress = Get-Content -LiteralPath $progressPath -Raw | ConvertFrom-Json
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

if (@($progress.cases | Where-Object { $_.runStatus -ne 'pending' }).Count -gt 0) {
  throw 'Some cases have already started; refusing to rebuild the queue.'
}

$cases = @()
$models = @(
  [pscustomobject]@{ short = 'mini'; api = 'gpt-4o-mini'; effort = $null },
  [pscustomobject]@{ short = 'terra'; api = 'gpt-6.1-terra'; effort = 'medium' }
)
foreach ($model in $models) {
  foreach ($size in @('40k', '100k')) {
    foreach ($set in $manifest.sets) {
      foreach ($repetition in 1..1) {
        $caseId = "$($set.id)-$size-$($model.short)-whole-capped-r$repetition"
        $cases += [pscustomobject]@{
          caseId = $caseId
          stage = 1
          sourceSetId = $set.id
          sizeId = $size
          model = $model.api
          reasoningEffort = $model.effort
          processing = 'whole'
          outputPolicy = 'capped'
          repetition = $repetition
          runStatus = 'pending'
          reviewStatus = 'pending'
          reason = 'Shared prerequisites pending.'
        }
      }
    }
  }
}

$progress.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
$progress.activeStage = 'setup'
$progress.queueStatus = 'defined_not_ready'
$progress.queueReason = 'The 40K-versus-100K pilot uses the frozen Dev Vault corpus; reference concepts, thresholds, budget, and harness remain pending.'
$progress.setup.currentTask = 'draft_reference_concepts_and_thresholds'
$progress.setup.sourceSets.status = 'ready'
$progress.setup.sourceSets.reason = 'Three five-document Dev Vault source sets were selected, snapshotted, redacted, and built at the 40K and 100K pilot sizes.'
$progress.setup.sourceSets | Add-Member -NotePropertyName evidence -NotePropertyValue 'data/evaluation/source-config.json; source-lock.json; corpus-manifest.json' -Force
$progress.cases = $cases
$progress.counts.queued = $cases.Count
$progress.counts.pending = $cases.Count
$progress | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $progressPath -Encoding utf8
Write-Output "Queued $($cases.Count) pilot cases from $(@($manifest.sets).Count) frozen source sets."
