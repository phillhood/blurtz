import React from "react";
import { SegmentedControl } from "@shychedelic/voidglass-react";
import type { CardSkin } from "@blurtz/shared";
import { useAuthStore } from "@stores/authStore";

const OPTIONS: Array<{ label: string; value: CardSkin }> = [
  { label: "Solid", value: "solid" },
  { label: "Emissive", value: "emissive" },
];

export const CardSkinToggle: React.FC = () => {
  const skin = useAuthStore((state) => state.user?.cardSkin ?? "solid");
  const setCardSkin = useAuthStore((state) => state.setCardSkin);

  return (
    <SegmentedControl
      options={OPTIONS}
      value={skin}
      onChange={(value) => setCardSkin(value as CardSkin)}
      aria-label="Card skin"
    />
  );
};
