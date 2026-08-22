<!--
  Marketing y canal — the tenant-facing knobs for doco_marketing, including the
  whole channel ladder (tier, shop number, event→action rules, collection window).

  Audited 2026-08-21: Marketing Settings carries 71 data fields and the SPA could
  reach 16 of them, through an API with no caller — so every ladder switch was
  Desk-only and a tenant could not turn its own CRM on. This renders the doctype's
  OWN layout through the generic SettingsPage, so a field added to the doctype
  shows up here without a second edit, and writes go through Frappe's permissions
  rather than an ignore_permissions save.
-->
<template>
  <SettingsPage doctype="Marketing Settings" :title="__('Marketing y canal')" class="p-8" />
</template>
<script setup>
import SettingsPage from '@/components/Settings/SettingsPage.vue'
</script>
