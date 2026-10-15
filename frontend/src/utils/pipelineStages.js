// The stages a deal may move to are its PIPELINE's stages (CRM program S1.4):
// a deal on the shop sales pipeline shows Nuevo … Ganado/Perdido, never the
// repair taxonomy; a deal without a pipeline (or an unknown one) falls back to
// the tenant's visible statuses.

/**
 * `pipelines` = crm.pipeline.api.get_pipelines(include_archived) rows. Returns
 * the live stages of `pipeline` as {name, type, color, probability}, or null
 * when the pipeline is not known to this user (the caller then falls back).
 */
export function pipelineStages(pipelines, pipeline) {
  if (!pipeline) return null
  const config = (pipelines || []).find((p) => p.name === pipeline)
  if (!config) return null
  return (config.stages || [])
    .filter((stage) => !Number(stage.archived))
    .map((stage) => ({
      name: stage.name || stage.status,
      type: stage.type,
      color: stage.color,
      probability: stage.probability,
    }))
}

/** Board drop routing: 'lost' needs a reason first, 'outcome' is Won, else 'flow'. */
export function stageMove(stages, status) {
  const type = (stages || []).find((s) => (s.value ?? s.name) === status)?.type
  if (type === 'Lost') return 'lost'
  if (type === 'Won') return 'outcome'
  return 'flow'
}

/**
 * Board columns with no pipeline chosen («Todos los embudos»): the default
 * pipeline's stages in its order, then any other stage that still holds deals.
 * Stages of other pipelines with no deals stay off the board, so a tenant on
 * the sales pipeline does not see the old repair taxonomy as empty columns.
 * With a pipeline chosen, its stages as given.
 */
export function boardStages(options, pipelines, pipeline, counts = {}) {
  if (pipeline) return options || []
  const fallback = (pipelines || []).find(
    (p) => Number(p.is_default) && !Number(p.archived),
  )
  if (!fallback) return options || []
  const order = (fallback.stages || [])
    .filter((stage) => !Number(stage.archived))
    .map((stage) => stage.name || stage.status)
  const byName = new Map(
    (options || []).map((option) => [option.value, option]),
  )
  const first = order.map((name) => byName.get(name)).filter(Boolean)
  const rest = (options || []).filter(
    (option) =>
      !order.includes(option.value) &&
      Number(counts?.[option.value]?.count) > 0,
  )
  return [...first, ...rest]
}
