import { Activity, CheckCircle, Zap, Globe, ArrowRight, Shield, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg text-foreground">
            <Activity className="w-5 h-5 text-primary" />
            <span>A11y ACT Tool</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="flex items-center justify-center px-6 py-24 text-center">
          <div className="max-w-3xl space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/20">
              <Shield className="w-4 h-4" />
              WCAG 2.1 Compliance Scanning
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight tracking-tight">
              Accessibility Auditing<br />
              <span className="text-primary">Made Simple</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Scan websites for WCAG accessibility violations, track issues over time,
              and generate detailed compliance reports — all in one place.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link href="/login">
                <Button size="lg" className="gap-2 text-base px-8">
                  Sign In to Get Started
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-muted/30 py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-center text-2xl font-bold text-foreground mb-12">
              Everything you need for accessibility compliance
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  icon: Zap,
                  title: "Fast Scanning",
                  desc: "Scan hundreds of pages with real browser rendering using Puppeteer. Get results fast without sacrificing accuracy.",
                },
                {
                  icon: Globe,
                  title: "Full WCAG Coverage",
                  desc: "Detect WCAG A, AA, and AAA violations across all pages. Covers color contrast, ARIA, keyboard navigation, and more.",
                },
                {
                  icon: CheckCircle,
                  title: "Track Progress",
                  desc: "Compare scans over time, measure accessibility improvements, and generate reports to share with your team.",
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="flex flex-col items-center text-center space-y-4 p-6 rounded-xl border border-border bg-card"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground text-lg">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                <div className="p-10 flex flex-col justify-center space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-white shadow-lg">
                      <Activity className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="font-bold text-foreground text-lg leading-tight">Chrome Extension</div>
                      <div className="text-sm text-muted-foreground">Scan any page instantly</div>
                    </div>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    Powered by the same custom ACT rules engine as the full scanner.
                    Audit any page directly in your browser. No account required.
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {[
                      "Same ACT rules engine as the full A11y ACT Tool",
                      "83+ custom WCAG 2.1 rules — Issue, Potential Issue & Best Practice",
                      "Highlights failing elements on the page with one click",
                      "Remediation guidance for every violation · 0 data sent to servers",
                    ].map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <Button size="lg" className="gap-2 text-base" asChild>
                      <a href="/a11y-act-extension.zip" download="a11y-act-extension.zip">
                        <Download className="w-4 h-4" />
                        Download Extension (.zip)
                      </a>
                    </Button>
                  </div>
                </div>
                <div className="hidden md:flex items-center justify-center bg-muted/40 border-l border-primary/10 p-10">
                  <div className="w-[220px] rounded-xl border border-border bg-white shadow-2xl overflow-hidden text-left">
                    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 bg-white">
                      <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
                        <Activity className="w-3 h-3 text-white" />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-gray-900 leading-none">A11y ACT Scanner</div>
                        <div className="text-[8px] text-gray-400 mt-0.5">WCAG 2.1 Checker</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 border-b border-gray-100 bg-white">
                      {[
                        { label: "Critical", count: "3", color: "text-red-600" },
                        { label: "Serious", count: "7", color: "text-orange-600" },
                        { label: "Moderate", count: "12", color: "text-amber-600" },
                        { label: "Minor", count: "4", color: "text-blue-600" },
                      ].map(({ label, count, color }) => (
                        <div key={label} className="text-center py-2 border-r border-gray-100 last:border-r-0">
                          <div className={`text-sm font-extrabold ${color}`}>{count}</div>
                          <div className="text-[8px] text-gray-400 uppercase tracking-wide">{label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="divide-y divide-gray-50 bg-gray-50">
                      {[
                        { impact: "critical", rule: "color-contrast", help: "Elements must have sufficient color contrast" },
                        { impact: "serious", rule: "image-alt", help: "Images must have alternate text" },
                        { impact: "moderate", rule: "label", help: "Form elements must have labels" },
                      ].map(({ impact, rule, help }) => (
                        <div key={rule} className="flex items-start gap-2 px-2.5 py-2 bg-white border-b border-gray-50">
                          <span className={`text-[7px] font-bold uppercase rounded px-1.5 py-0.5 mt-0.5 flex-shrink-0 ${impact === "critical" ? "bg-red-100 text-red-700" : impact === "serious" ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"}`}>{impact}</span>
                          <div className="min-w-0">
                            <div className="text-[8px] font-mono text-gray-400 truncate">{rule}</div>
                            <div className="text-[8px] text-gray-700 leading-tight line-clamp-2">{help}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 px-6 text-center">
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-3xl font-bold text-foreground">Ready to audit your site?</h2>
            <p className="text-muted-foreground text-lg">Sign in and start your first accessibility scan in minutes.</p>
            <Link href="/login">
              <Button size="lg" className="gap-2 text-base px-8">
                Sign In <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <span className="font-medium">A11y ACT Tool</span>
          </div>
          <span>Professional accessibility auditing for modern web teams.</span>
        </div>
      </footer>
    </div>
  );
}
