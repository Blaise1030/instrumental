import type { AppNotification } from "@/shared/domain";
import type { NotificationService } from "./notificationService";

type NotificationApi = {
  getNotifications: () => Promise<AppNotification[]>;
  markRead: (payload: { id: string }) => Promise<void>;
  markAllRead: () => Promise<void>;
  onNotificationsChanged: (callback: () => void) => () => void;
};

function readNotificationApi(): NotificationApi | undefined {
  if (typeof globalThis === "undefined") return undefined;
  return (globalThis as typeof globalThis & { notificationApi?: NotificationApi }).notificationApi;
}

export class IpcNotificationService implements NotificationService {
  constructor(private readonly api: NotificationApi | undefined = readNotificationApi()) {}

  private requireApi(): NotificationApi {
    if (!this.api) throw new Error("notificationApi is not available.");
    return this.api;
  }

  async list(): Promise<AppNotification[]> {
    return this.requireApi().getNotifications();
  }

  async markRead(id: string): Promise<void> {
    return this.requireApi().markRead({ id });
  }

  async markAllRead(): Promise<void> {
    return this.requireApi().markAllRead();
  }

  onDidChange(cb: () => void): () => void {
    return this.requireApi().onNotificationsChanged(cb);
  }
}
