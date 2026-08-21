import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Search } from "lucide-react";

export default function SeoPage() {
  return (
    <div className="max-w-2xl mx-auto py-16">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Search className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>SEO</CardTitle>
          <CardDescription>
            This section is coming soon. SEO auditing alongside accessibility scanning will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
