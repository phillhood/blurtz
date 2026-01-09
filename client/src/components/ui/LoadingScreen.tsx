import React from "react";
import { PageContainer } from "@styles";
import { LoadingSpinner } from ".";

interface LoadingScreenProps {
  title?: string;
  subtitle?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({
  title = "Loading...",
  subtitle,
}) => (
  <PageContainer>
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <LoadingSpinner size="large" />
      <h2 style={{ marginTop: "20px" }}>{title}</h2>
      {subtitle && <p style={{ color: "#6b7280" }}>{subtitle}</p>}
    </div>
  </PageContainer>
);

export default LoadingScreen;
