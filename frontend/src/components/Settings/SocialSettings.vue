<!--
  Social (redes) — the tenant-facing knobs for the social calendar: the Holiday
  List (festivos → blackout days), curated blackout dates, posting windows, brand
  voice/kit, CTA defaults.

  Same contract as MarketingSettings (8c6e6fa59): render the doctype's OWN layout
  through the generic SettingsPage, so a field added to Social Settings appears
  here without a second edit and writes go through Frappe's permissions. Password
  fields (page tokens) round-trip safely — Frappe only touches __Auth when a new
  truthy value is typed.
-->
<template>
  <SettingsPage doctype="Social Settings" :title="__('Social (redes)')" class="p-8" />
</template>
<script setup>
import SettingsPage from '@/components/Settings/SettingsPage.vue'
</script>
