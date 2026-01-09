import { useState, useCallback } from "react";

export type NotificationType = "success" | "error" | "info";

export interface Notification {
  type: NotificationType;
  message: string;
}

export const useNotifications = () => {
  const [notification, setNotification] = useState<Notification | null>(null);

  const showNotification = useCallback(
    (type: NotificationType, message: string) => {
      setNotification({ type, message });
    },
    []
  );

  const clearNotification = useCallback(() => {
    setNotification(null);
  }, []);

  return {
    notification,
    showNotification,
    clearNotification,
  };
};
