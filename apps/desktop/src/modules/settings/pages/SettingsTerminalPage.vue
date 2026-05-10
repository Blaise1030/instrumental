<script setup lang="ts">
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { useSettingsLayoutContext } from "@/modules/settings/settingsLayoutContext";

const { terminalNotificationsEnabled } = useSettingsLayoutContext();
</script>

<template>
  <div
    id="workspace-settings-panel-terminal"
    role="tabpanel"
    tabindex="0"
    aria-label="Terminal settings"
  >
    <p class="text-sm leading-relaxed text-muted-foreground">
      When a thread finishes, needs approval, or fails, entries appear in the in-app notification center and the app may
      show a system notification when your OS allows it—sound and banner behavior follow system notification settings.
      Threads that may need your attention stay highlighted until you open them.
    </p>

    <ItemGroup class="mt-8">
      <Item variant="outline" size="default" class="items-start sm:items-center">
        <ItemContent class="min-w-0">
          <ItemTitle class="text-sm font-medium text-foreground">Desktop notifications</ItemTitle>
          <ItemDescription class="mt-1 max-w-xl text-xs leading-relaxed line-clamp-none">
            Show banners and play sounds when Instrument needs your attention while in the background.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch
            id="settings-terminal-notifications"
            v-model="terminalNotificationsEnabled"
            aria-label="Desktop notifications"
          />
        </ItemActions>
      </Item>
    </ItemGroup>
  </div>
</template>
