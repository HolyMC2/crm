// Door 1 of «Pregúntale a Muelle»: the search field asks too. A question
// («¿cuánto me debe…?», «qué hago primero», a sentence, or `?algo`) gets
// «Preguntar a Muelle» as the first result; choosing it opens the sheet and
// asks. The assistant is also a place (E7): the empty palette, a door word
// («asistente», «muelle», «ayuda»…) or a bare `?` list «Pregúntale a Muelle».
// Only for workers who have the assistant (shell_api.status).
import { looksLikeQuestion, questionText } from './assistantText'
import { assistantEnabled, loadStatus } from './useAssistant'

const DOOR_WORDS = /asistente|preg[uú]nta|muelle|\bbot\b|ayuda/iu

export function createAssistantProvider() {
  return {
    key: 'asistente',
    label: 'Ask Muelle',
    scopes: ['assistant'],
    async search(query) {
      const raw = query.raw ?? query.text
      const scoped = query.scope === 'assistant'
      const text = questionText(raw)
      const question = Boolean(text) && (scoped || looksLikeQuestion(raw))
      const door = !text || (!scoped && DOOR_WORDS.test(text))
      if (!question && !door) return []
      await loadStatus()
      if (!assistantEnabled.value) return []
      const items = []
      if (question)
        items.push({
          id: 'asistente.preguntar',
          group: 'acciones',
          title: __('Ask Muelle: «{0}»', [text]),
          keywords: text,
          icon: 'lucide-sparkles',
          action: 'assistant',
          args: { text },
        })
      if (door)
        items.push({
          id: 'asistente.abrir',
          group: 'ir_a',
          title: __('Ask Muelle'),
          keywords: 'asistente pregúntale muelle bot ayuda',
          icon: 'lucide-sparkles',
          action: 'assistant',
          args: { text: '' },
        })
      return items
    },
  }
}
