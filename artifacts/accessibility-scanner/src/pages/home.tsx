import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateScan, useParseSitemap } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { UploadCloud, Globe, Link as LinkIcon, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [scanName, setScanName] = useState("");
  
  // Tab 1: Manual URLs
  const [manualUrls, setManualUrls] = useState("");
  
  // Tab 2: Sitemap
  const [sitemapUrl, setSitemapUrl] = useState("");
  const parseSitemap = useParseSitemap();
  
  // Tab 3: CSV
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Common parsed URLs state
  const [parsedUrls, setParsedUrls] = useState<string[]>([]);
  
  const createScan = useCreateScan();

  const handleManualUrlsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setManualUrls(e.target.value);
    const urls = e.target.value.split("\n").map(u => u.trim()).filter(Boolean);
    setParsedUrls(urls);
  };

  const handleParseSitemap = () => {
    if (!sitemapUrl) return;
    parseSitemap.mutate({ data: { url: sitemapUrl } }, {
      onSuccess: (data) => {
        setParsedUrls(data.urls);
        toast({ title: "Sitemap Parsed", description: `Found ${data.count} URLs.` });
      },
      onError: () => {
        toast({ title: "Error parsing sitemap", description: "Could not parse sitemap URL", variant: "destructive" });
      }
    });
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/scans/upload-csv", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setParsedUrls(data.urls);
      toast({ title: "CSV Parsed", description: `Found ${data.count} URLs.` });
    } catch (err) {
      toast({ title: "Error parsing CSV", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const startScan = () => {
    if (parsedUrls.length === 0) {
      toast({ title: "No URLs", description: "Please provide at least one URL to scan.", variant: "destructive" });
      return;
    }
    
    createScan.mutate({
      data: {
        urls: parsedUrls,
        name: scanName || undefined,
        options: { maxConcurrency: 5 }
      }
    }, {
      onSuccess: (data) => {
        setLocation(`/scans/${data.id}`);
      },
      onError: () => {
        toast({ title: "Error starting scan", description: "Could not start the scan", variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Accessibility Scan</h1>
        <p className="text-muted-foreground mt-2">
          Configure a new scan by providing URLs manually, uploading a CSV, or using a sitemap.xml.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scan Configuration</CardTitle>
          <CardDescription>Set a name and provide the URLs to be audited.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="scanName">Scan Name (Optional)</Label>
            <Input 
              id="scanName" 
              placeholder="e.g., Marketing Site Audit Q3" 
              value={scanName}
              onChange={(e) => setScanName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>URL Input Method</Label>
            <Tabs defaultValue="manual" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="manual"><LinkIcon className="w-4 h-4 mr-2"/> Manual Entry</TabsTrigger>
                <TabsTrigger value="sitemap"><Globe className="w-4 h-4 mr-2"/> Sitemap</TabsTrigger>
                <TabsTrigger value="csv"><UploadCloud className="w-4 h-4 mr-2"/> CSV Upload</TabsTrigger>
              </TabsList>
              
              <TabsContent value="manual" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label>URLs (one per line)</Label>
                  <Textarea 
                    placeholder="https://example.com&#10;https://example.com/about" 
                    className="min-h-[200px] font-mono text-sm"
                    value={manualUrls}
                    onChange={handleManualUrlsChange}
                  />
                </div>
              </TabsContent>

              <TabsContent value="sitemap" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Sitemap URL</Label>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="https://example.com/sitemap.xml" 
                      value={sitemapUrl}
                      onChange={(e) => setSitemapUrl(e.target.value)}
                    />
                    <Button 
                      variant="secondary" 
                      onClick={handleParseSitemap}
                      disabled={!sitemapUrl || parseSitemap.isPending}
                    >
                      {parseSitemap.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Fetch URLs
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="csv" className="mt-4 space-y-4">
                <div 
                  className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (file) handleFileUpload(file);
                  }}
                  onClick={() => document.getElementById("csv-upload")?.click()}
                >
                  <input 
                    id="csv-upload" 
                    type="file" 
                    accept=".csv" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                  <UploadCloud className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold text-lg">Drop your CSV file here</h3>
                  <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
                  {isUploading && <p className="text-sm text-primary mt-4 flex items-center justify-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</p>}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {parsedUrls.length > 0 && (
            <Alert className="bg-muted border-muted-foreground/20">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Ready to scan {parsedUrls.length} URLs</AlertTitle>
              <AlertDescription>
                <div className="mt-2 text-xs font-mono max-h-32 overflow-y-auto space-y-1 text-muted-foreground">
                  {parsedUrls.slice(0, 10).map((url, i) => (
                    <div key={i} className="truncate">{url}</div>
                  ))}
                  {parsedUrls.length > 10 && (
                    <div className="italic text-primary">...and {parsedUrls.length - 10} more</div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

        </CardContent>
        <CardFooter className="bg-muted/50 flex justify-end border-t p-6">
          <Button 
            size="lg" 
            onClick={startScan} 
            disabled={parsedUrls.length === 0 || createScan.isPending}
            className="w-full sm:w-auto"
          >
            {createScan.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
            Start Scan
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
