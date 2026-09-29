// Channel settings of one form (WhatsApp Flow, chat share text, WhatsApp
// confirmation, email), served by the optional doco_marketing addon
// (doco_marketing.api.form_channels). The page creates this only when the addon
// is installed; edits save together with the form through the builder's
// registerSaver hook, while Flow actions (build, publish, check) run at once.
import { call, createResource, toast } from 'frappe-ui'
import { reactive, ref } from 'vue'

export const FORM_CHANNELS = Symbol('form-channels')
const API = 'doco_marketing.api.form_channels'

export function useFormChannels(form, builder) {
  const followup = reactive({ mode: 'none', template: '', template_params: '' })
  const mail = reactive({
    notify_team_email: false,
    confirm_email_template: '',
  })
  const dirty = ref(false)
  const busy = ref('') // name of the running Flow action, for button spinners
  const metaErrors = ref([])

  const channels = createResource({
    url: `${API}.get_channels`,
    params: { form },
    auto: true,
    onSuccess(data) {
      Object.assign(followup, {
        mode: data.followup?.mode || 'none',
        template: data.followup?.template || '',
        template_params: data.followup?.template_params || '',
      })
      Object.assign(mail, {
        notify_team_email: !!data.mail?.notify_team_email,
        confirm_email_template: data.mail?.confirm_email_template || '',
      })
      dirty.value = false
    },
  })

  function change(target, key, value) {
    target[key] = value
    dirty.value = true
    builder.markDirty()
  }

  builder.registerSaver(async () => {
    if (!dirty.value) return
    await call(`${API}.save_followup`, {
      form,
      mode: followup.mode,
      template: followup.mode === 'template' ? followup.template : null,
      template_params:
        followup.mode === 'template' ? followup.template_params : null,
    })
    await call(`${API}.save_mail`, {
      form,
      notify_team_email: mail.notify_team_email ? 1 : 0,
      confirm_email_template: mail.confirm_email_template || null,
    })
    dirty.value = false
    channels.reload()
  })

  // Flow actions change state outside the form, so they run immediately
  async function flowAction(action, method, successText) {
    busy.value = action
    try {
      const res = await call(`${API}.${method}`, { form })
      if (channels.data) channels.data.whatsapp = res
      metaErrors.value = res?.meta_errors || []
      if (successText) toast.success(successText)
      return res
    } catch (e) {
      toast.error(
        e?.messages?.[0] || e?.message || __('WhatsApp did not accept it'),
      )
      return null
    } finally {
      busy.value = ''
    }
  }
  const buildFlow = () =>
    flowAction(
      'build',
      'sync_whatsapp_flow',
      __('WhatsApp Flow updated from the form'),
    )
  const publishFlow = () =>
    flowAction(
      'publish',
      'publish_whatsapp_flow',
      __('WhatsApp Flow published'),
    )
  const checkFlow = () => flowAction('check', 'refresh_whatsapp_flow_status')

  async function saveQuickReply(channel) {
    busy.value = `reply-${channel}`
    try {
      await call(`${API}.save_share_reply`, { form, channel })
      toast.success(__('Saved as a quick reply in the inbox'))
    } catch (e) {
      toast.error(e?.messages?.[0] || __('Could not save the quick reply'))
    } finally {
      busy.value = ''
    }
  }

  return {
    channels,
    followup,
    mail,
    dirty,
    busy,
    metaErrors,
    change,
    buildFlow,
    publishFlow,
    checkFlow,
    saveQuickReply,
  }
}
