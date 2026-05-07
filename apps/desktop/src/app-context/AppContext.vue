<template>
    <slot />
</template>

<script setup lang="ts">
import { onMounted, provide, ref } from 'vue';
import type { AppContext, AppMode } from './type';
import { IpcGitService } from "@/modules/git/services/ipcGitService";
import { IpcThreadManagementService } from "@/modules/agent/services/ipcThreadManagementService";
import { IpcWorkspaceService } from "./ipcWorkspaceService";

const props = defineProps<{ mode: AppMode }>();
const services = ref<AppContext>();

onMounted(() => {
  if (props.mode === "desktop") {
    services.value = {
      mode: props.mode,
      threadManagementService: new IpcThreadManagementService(),
      gitService: new IpcGitService(),
      workspaceService: new IpcWorkspaceService(),
    };
  }
});

provide('appContext', services)
</script>