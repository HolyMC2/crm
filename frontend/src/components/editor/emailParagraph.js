// A paragraph that keeps its class attribute: the email composer marks quoted
// replies with `reply-to-content`, which the mail pipeline and EmailContent read.
import Paragraph from '@tiptap/extension-paragraph'

export const EmailParagraph = Paragraph.extend({
  addAttributes() {
    return {
      class: {
        default: null,
        renderHTML: (attributes) => {
          if (!attributes.class) {
            return {}
          }
          return {
            class: `${attributes.class}`,
          }
        },
      },
    }
  },
})
