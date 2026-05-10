import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import { useRegisterGlobalKeybindings } from "@/hooks/useRegisterGlobalKeybindings";
import { useWorkspaceShellUiStore } from "@/stores/workspaceShellUiStore";

const Host = defineComponent({
  name: "RegisterGlobalKeybindingsHost",
  setup() {
    useRegisterGlobalKeybindings();
    return () => null;
  }
});

describe("useRegisterGlobalKeybindings", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { platform: "MacIntel", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)" });
  });

  it("toggles workspace launcher on ⌘K using merged keybinding definitions", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    mount(Host, { global: { plugins: [pinia] } });

    const shell = useWorkspaceShellUiStore();
    expect(shell.workspaceLauncherOpen).toBe(false);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        code: "KeyK",
        metaKey: true,
        bubbles: true,
        cancelable: true
      })
    );
    expect(shell.workspaceLauncherOpen).toBe(true);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        code: "KeyK",
        metaKey: true,
        bubbles: true,
        cancelable: true
      })
    );
    expect(shell.workspaceLauncherOpen).toBe(false);
  });
});
