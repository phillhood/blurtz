import React from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";

interface ProfileTabsProps {
  active: "profile" | "history";
}

const TABS: Array<{ key: ProfileTabsProps["active"]; label: string; to: string }> = [
  { key: "profile", label: "Profile", to: "/profile" },
  { key: "history", label: "History", to: "/profile/history" },
];

const ProfileTabs: React.FC<ProfileTabsProps> = ({ active }) => {
  return (
    <div className="blurtz-tabs" role="tablist">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          to={tab.to}
          role="tab"
          aria-selected={tab.key === active}
          className={clsx(
            "blurtz-tabs__tab",
            tab.key === active && "blurtz-tabs__tab--active"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
};

export default ProfileTabs;
