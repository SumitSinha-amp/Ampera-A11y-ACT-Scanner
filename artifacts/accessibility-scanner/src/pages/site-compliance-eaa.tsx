import { ComplianceReport } from "@/pages/site/ComplianceReport";

export default function SiteComplianceEaa({ siteId }: { siteId: number }) {
  return <ComplianceReport siteId={siteId} framework="eaa" />;
}
