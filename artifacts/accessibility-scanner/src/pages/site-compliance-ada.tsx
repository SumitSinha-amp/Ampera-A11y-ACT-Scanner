import { ComplianceReport } from "@/pages/site/ComplianceReport";

export default function SiteComplianceAda({ siteId }: { siteId: number }) {
  return <ComplianceReport siteId={siteId} framework="ada" />;
}
