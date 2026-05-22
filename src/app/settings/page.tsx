"use client";

import * as React from "react";
import { toast } from "sonner";
import { Settings, Trash2, Database, Cloud } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface Settings {
  cleanupOldScansDays: string;
  cleanupAuditLogsDays: string;
  cleanupBulkScansDays: string;
  cleanupS3Artifacts: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setSettings(data))
      .catch(() => toast.error("Failed to load settings"));
  }, []);

  function update(key: keyof Settings, value: string) {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setDirty(true);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cleanupOldScansDays: Number(settings.cleanupOldScansDays),
          cleanupAuditLogsDays: Number(settings.cleanupAuditLogsDays),
          cleanupBulkScansDays: Number(settings.cleanupBulkScansDays),
          cleanupS3Artifacts: settings.cleanupS3Artifacts,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to save settings");
        return;
      }
      const updated = await res.json();
      setSettings(updated);
      setDirty(false);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-caption uppercase tracking-widest text-muted-foreground/40">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="space-y-1">
          <p className="text-caption uppercase tracking-headline text-muted-foreground/30">Configuration</p>
          <h1 className="text-2xl tracking-tight text-foreground">
            Settings
          </h1>
          <p className="text-body-sm text-muted-foreground uppercase tracking-widest">
            Configure data retention and cleanup policies
          </p>
        </div>
        <Button onClick={save} disabled={saving || !dirty} className="rounded-none uppercase tracking-widest text-caption">
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <Card className="bg-surface-1 border-white/10 rounded-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-body-sm uppercase tracking-caps text-foreground">
            <Database className="h-4 w-4 text-accent" />
            Scan Retention
          </CardTitle>
          <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/50">
            Completed scans older than this threshold are automatically deleted every 24 hours,
            including associated vulnerability findings, metadata, and report files.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="cleanupOldScansDays" className="text-caption uppercase tracking-widest text-muted-foreground/60">Retention period</Label>
              <p className="text-caption uppercase tracking-widest text-muted-foreground/50">1 &ndash; 365 days</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="cleanupOldScansDays"
                type="number"
                min={1}
                max={365}
                className="w-24 text-right"
                value={settings.cleanupOldScansDays}
                onChange={(e) => update("cleanupOldScansDays", e.target.value)}
              />
              <span className="text-caption uppercase tracking-widest text-muted-foreground/50">days</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-surface-1 border-white/10 rounded-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-body-sm uppercase tracking-caps text-foreground">
            <Trash2 className="h-4 w-4 text-accent" />
            Audit Log Retention
          </CardTitle>
          <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/50">
            Audit log entries older than this threshold are purged during the daily cleanup cycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="cleanupAuditLogsDays" className="text-caption uppercase tracking-widest text-muted-foreground/60">Retention period</Label>
              <p className="text-caption uppercase tracking-widest text-muted-foreground/50">1 &ndash; 365 days</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="cleanupAuditLogsDays"
                type="number"
                min={1}
                max={365}
                className="w-24 text-right"
                value={settings.cleanupAuditLogsDays}
                onChange={(e) => update("cleanupAuditLogsDays", e.target.value)}
              />
              <span className="text-caption uppercase tracking-widest text-muted-foreground/50">days</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-surface-1 border-white/10 rounded-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-body-sm uppercase tracking-caps text-foreground">
            <Trash2 className="h-4 w-4 text-accent" />
            Bulk Scan Batch Retention
          </CardTitle>
          <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/50">
            Old bulk scan batch records are removed after this many days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="cleanupBulkScansDays" className="text-caption uppercase tracking-widest text-muted-foreground/60">Retention period</Label>
              <p className="text-caption uppercase tracking-widest text-muted-foreground/50">1 &ndash; 365 days</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="cleanupBulkScansDays"
                type="number"
                min={1}
                max={365}
                className="w-24 text-right"
                value={settings.cleanupBulkScansDays}
                onChange={(e) => update("cleanupBulkScansDays", e.target.value)}
              />
              <span className="text-caption uppercase tracking-widest text-muted-foreground/50">days</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-surface-1 border-white/10 rounded-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-body-sm uppercase tracking-caps text-foreground">
            <Cloud className="h-4 w-4 text-accent" />
            S3 Artifact Cleanup
          </CardTitle>
          <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/50">
            When enabled, raw scanner results and SBOMs stored in S3 are deleted alongside
            their parent scan records during cleanup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="cleanupS3Artifacts" className="text-caption uppercase tracking-widest text-muted-foreground/60">Delete S3 artifacts on scan cleanup</Label>
              <p className="text-caption uppercase tracking-widest text-muted-foreground/50">
                Disable to keep raw results in object storage after scans are purged
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="cleanupS3Artifacts"
                checked={settings.cleanupS3Artifacts === "true"}
                onCheckedChange={(checked) =>
                  update("cleanupS3Artifacts", checked ? "true" : "false")
                }
              />
              <Badge variant={settings.cleanupS3Artifacts === "true" ? "default" : "secondary"}>
                {settings.cleanupS3Artifacts === "true" ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-caption uppercase tracking-widest text-muted-foreground/30">
        Cleanup runs automatically 30 seconds after server start and then every 24 hours.
        Changes take effect on the next cleanup cycle.
      </p>
    </div>
  );
}
