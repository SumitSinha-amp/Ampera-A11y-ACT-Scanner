import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, BookOpen, CheckCircle2, Compass, PlayCircle, Sparkles } from "lucide-react";
import { startAppWalkthrough } from "@/lib/walkthrough";

export default function AppWalkthrough() {
  const [started, setStarted] = useState(false);

  const handleStart = () => {
    setStarted(true);
    startAppWalkthrough();
  };

  return (
    <div className="w-full space-y-6">
      <div>
        <Badge className="mb-3 gap-1.5 bg-primary/10 text-primary hover:bg-primary/15">
          <Compass className="h-3.5 w-3.5" />
          Guided tour
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">App Walkthrough</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Take a quick guided tour of the platform navigation and core tools.
          You can cancel it at any time.
        </p>
      </div>

      <Card className="overflow-hidden border-primary/20">
        <div className="h-1 bg-gradient-to-r from-sky-500 via-primary to-violet-500" />
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5 text-primary" />
            Explore the platform
          </CardTitle>
          <CardDescription>
            The tour highlights the version badge, header actions, main menu,
            navigation sections, and available menu groups for your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["01", "Header", "Updates, walkthrough, documentation, and account controls."],
              ["02", "Navigation", "Accessibility, QA, and role-specific areas."],
              ["03", "Controls", "Move forward, go back, or cancel whenever you want."],
            ].map(([number, title, description]) => (
              <div key={number} className="rounded-xl border bg-muted/20 p-4">
                <span className="font-mono text-xs font-bold text-primary">{number}</span>
                <h2 className="mt-2 text-sm font-semibold">{title}</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
          <Button
            data-testid="button-start-app-walkthrough"
            onClick={handleStart}
            className="gap-2"
          >
            <PlayCircle className="h-4 w-4" />
            {started ? "Restart walkthrough" : "Start walkthrough"}
            <ArrowRight className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            No changes are made while you take the tour.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-start gap-3 p-4">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm leading-6 text-muted-foreground">
            Need rule details instead? Open Documentation from the header for
            scanner guidance, WCAG references, and manual-only criteria.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}