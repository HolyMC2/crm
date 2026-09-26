/** Pure picker rules shared by create and record forms. Never replace history on load. */
export function activePipelineStages(pipeline) {
  return (pipeline?.stages || []).filter((stage) => !stage.archived)
}

export function pipelineSelection(pipeline, currentStatus = '') {
  const stages = activePipelineStages(pipeline)
  const retained = stages.find(
    (stage) => stage.name === currentStatus && !stage.allowed_from,
  )
  const first = stages.find(
    (stage) => !['Won', 'Lost'].includes(stage.type) && !stage.allowed_from,
  )
  return {
    pipeline: pipeline.name,
    sales_company: pipeline.sales_company || '',
    status: retained?.name || first?.name || '',
    ...(pipeline.currency ? { currency: pipeline.currency } : {}),
  }
}

export function pipelineStageOptions(pipeline, currentStatus = '') {
  return (pipeline?.stages || [])
    .filter((stage) => !stage.archived || stage.name === currentStatus)
    .map((stage) => ({
      label: stage.name + (stage.archived ? ' · Archived' : ''),
      value: stage.name,
      disabled: Boolean(stage.archived),
    }))
}
