import type { AppNotification } from "@/shared/domain";

export interface NotificationService {
  list(): Promise<AppNotification[]>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  /** Registers a callback fired when notifications change. Returns an unsubscribe function. */
  onDidChange(cb: () => void): () => void;
}
