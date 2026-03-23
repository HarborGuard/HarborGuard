"use client";

import * as React from "react";
import { toast } from "sonner";
import { IconSettings, IconTrash, IconDatabase, IconCloud } from "@tabler/icons-react";
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
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <IconSettings className="size-6" />
            Settings
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure data retention and cleanup policies
          </p>
        </div>
        <Button onClick={save} disabled={saving || !dirty}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconDatabase className="size-5" />
            Scan Retention
          </CardTitle>
          <CardDescription>
            Completed scans older than this threshold are automatically deleted every 24 hours,
            including associated vulnerability findings, metadata, and report files.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="cleanupOldScansDays">Retention period</Label>
              <p className="text-xs text-muted-foreground">1 &ndash; 365 days</p>
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
              <span className="text-sm text-muted-foreground">days</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconTrash className="size-5" />
            Audit Log Retention
          </CardTitle>
          <CardDescription>
            Audit log entries older than this threshold are purged during the daily cleanup cycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="cleanupAuditLogsDays">Retention period</Label>
              <p className="text-xs text-muted-foreground">1 &ndash; 365 days</p>
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
              <span className="text-sm text-muted-foreground">days</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconTrash className="size-5" />
            Bulk Scan Batch Retention
          </CardTitle>
          <CardDescription>
            Old bulk scan batch records are removed after this many days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="cleanupBulkScansDays">Retention period</Label>
              <p className="text-xs text-muted-foreground">1 &ndash; 365 days</p>
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
              <span className="text-sm text-muted-foreground">days</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconCloud className="size-5" />
            S3 Artifact Cleanup
          </CardTitle>
          <CardDescription>
            When enabled, raw scanner results and SBOMs stored in S3 are deleted alongside
            their parent scan records during cleanup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="cleanupS3Artifacts">Delete S3 artifacts on scan cleanup</Label>
              <p className="text-xs text-muted-foreground">
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

      <p className="text-xs text-muted-foreground">
        Cleanup runs automatically 30 seconds after server start and then every 24 hours.
        Changes take effect on the next cleanup cycle.
      </p>
    </div>
  );
}
