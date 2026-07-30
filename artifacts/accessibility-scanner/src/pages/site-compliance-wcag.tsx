import { ComplianceReport } from "@/pages/site/ComplianceReport";

export default function SiteComplianceWcag({ siteId }: { siteId: number }) {
  return <ComplianceReport siteId={siteId} framework="wcag" />;
}
