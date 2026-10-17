// Door 1 of «Pregúntale a Muelle»: the search field asks too. A question
// («¿cuánto me debe…?», «qué hago primero», a sentence, or `?algo`) gets
// «Preguntar a Muelle» as the first result; choosing it opens the sheet and
// asks. Only for workers who have the assistant (shell_api.status).
import { looksLikeQuestion, questionText } from './assistantText'
import { assistantEnabled, loadStatus } from './useAssistant'

export function createAssistantProvider() {
  return {
    key: 'asistente',
    label: 'Ask Muelle',
    async search(query) {
      const text = questionText(query.raw ?? query.text)
      if (!text || !looksLikeQuestion(query.raw ?? query.text)) return []
      await loadStatus()
      if (!assistantEnabled.value) return []
      return [
        {
          id: 'asistente.preguntar',
          group: 'acciones',
          title: __('Ask Muelle: «{0}»', [text]),
          keywords: text,
          icon: 'lucide-sparkles',
          action: 'assistant',
          args: { text },
        },
      ]
    },
  }
}
