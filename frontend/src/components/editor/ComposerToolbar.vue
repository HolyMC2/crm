<template>
  <EditorFixedMenu :items="fullToolbar" />
</template>

<script setup>
import { EditorFixedMenu } from 'frappe-ui/editor'
import { fullToolbar } from '@/components/editor/config'
</script>
