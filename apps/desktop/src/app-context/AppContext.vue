<template>
    <slot />
</template>

<script setup lang="ts">
import { onMounted, provide, ref } from 'vue';
import type { AppContext, AppMode } from './type';
import { IpcGitService } from "@/modules/git/services/ipcGitService";
import { IpcThreadManagementService } from "@/modules/agent/services/ipcThreadManagementService";
import { IpcWorkspaceService } from "./ipcWorkspaceService";
import { IpcNotificationService } from "@/modules/notification/services/ipcNotificationService";

const props = defineProps<{ mode: AppMode }>();
const services = ref<AppContext>();

onMounted(() => {
  if (props.mode === "desktop") {
    services.value = {
      mode: props.mode,
      threadManagementService: new IpcThreadManagementService(),
      gitService: new IpcGitService(),
      workspaceService: new IpcWorkspaceService(),
      notificationService: new IpcNotificationService(),
    };
  }
});

provide('appContext', services)
</script>