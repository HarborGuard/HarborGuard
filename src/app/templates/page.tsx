"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Settings, Play, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CreateTemplateDialog } from "@/components/templates/CreateTemplateDialog";
import { EditTemplateDialog } from "@/components/templates/EditTemplateDialog";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

interface ScanTemplate {
  id: string;
  name: string;
  description?: string;
  environment: "production" | "staging" | "development" | "any";
  scannerConfig: {
    scanners: string[];
    failOnHigh?: boolean;
    timeout?: number;
    cacheEnabled?: boolean;
    parallelScans?: boolean;
  };
  policyConfig?: {
    maxCritical: number;
    maxHigh: number;
    maxMedium?: number;
    complianceRequired: boolean;
    generateReport?: boolean;
  };
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<ScanTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ScanTemplate | null>(
    null
  );

  useEffect(() => {
    fetchTemplates();
  }, [selectedEnvironment]);

  const fetchTemplates = async () => {
    try {
      const url =
        selectedEnvironment === "all"
          ? "/api/templates"
          : `/api/templates?environment=${selectedEnvironment}`;

      const response = await fetch(url);
      const result = await response.json();

      if (result.success) {
        setTemplates(result.data);
      } else {
        toast.error("Failed to load templates");
      }
    } catch (error) {
      toast.error("Failed to load templates");
      console.error("Error fetching templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteTemplate = async (templateId: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (result.success) {
        toast.success("Template deleted successfully");
        fetchTemplates();
      } else {
        toast.error(result.error || "Failed to delete template");
      }
    } catch (error) {
      toast.error("Failed to delete template");
      console.error("Error deleting template:", error);
    }
  };

  const getEnvironmentColor = (environment: string) => {
    switch (environment) {
      case "production":
        return "bg-red-100 text-red-800";
      case "staging":
        return "bg-yellow-100 text-yellow-800";
      case "development":
        return "bg-green-100 text-green-800";
      case "any":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getSeverityLevel = (template: ScanTemplate) => {
    if (!template.policyConfig) return "Standard";

    const { maxCritical, maxHigh } = template.policyConfig;
    if (maxCritical === 0 && maxHigh <= 5) return "Strict";
    if (maxCritical <= 2 && maxHigh <= 10) return "Balanced";
    return "Permissive";
  };

  const filteredTemplates =
    selectedEnvironment === "all"
      ? templates
      : templates.filter(
          (t) =>
            t.environment === selectedEnvironment || t.environment === "any"
        );

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading templates...</p>
          </div>
        </div>
      </div>
    );
  }

  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: "Templates", href: "/templates" },
  ];

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset className="flex flex-col">
        <SiteHeader breadcrumbs={breadcrumbs} />
        <div className="flex-1 overflow-auto">
          <div className="@container/main flex flex-col gap-2 p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Scan Templates</h1>
                <p className="text-gray-600 mt-1">
                  Pre-configured scan profiles for different environments and
                  use cases
                </p>
              </div>
              <Button
                onClick={() => setShowCreateDialog(true)}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Create Template
              </Button>
            </div>

            <Tabs
              value={selectedEnvironment}
              onValueChange={setSelectedEnvironment}
            >
              <TabsList>
                <TabsTrigger value="all">All Templates</TabsTrigger>
                <TabsTrigger value="production">Production</TabsTrigger>
                <TabsTrigger value="staging">Staging</TabsTrigger>
                <TabsTrigger value="development">Development</TabsTrigger>
                <TabsTrigger value="any">Universal</TabsTrigger>
              </TabsList>

              <TabsContent value={selectedEnvironment} className="mt-6">
                {filteredTemplates.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Settings className="h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        No templates found
                      </h3>
                      <p className="text-gray-500 text-center mb-4">
                        {selectedEnvironment === "all"
                          ? "Create your first scan template to get started"
                          : `No templates found for ${selectedEnvironment} environment`}
                      </p>
                      <Button
                        onClick={() => setShowCreateDialog(true)}
                        variant="outline"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create Template
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {filteredTemplates.map((template) => (
                      <Card
                        key={template.id}
                        className={`relative ${
                          template.isDefault ? "ring-2 ring-blue-500" : ""
                        }`}
                      >
                        {template.isDefault && (
                          <div className="absolute -top-2 -right-2">
                            <Badge className="bg-blue-500 text-white">
                              Default
                            </Badge>
                          </div>
                        )}

                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <CardTitle className="text-lg">
                                {template.name}
                              </CardTitle>
                              {template.description && (
                                <CardDescription className="mt-1">
                                  {template.description}
                                </CardDescription>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 mt-3">
                            <Badge
                              className={getEnvironmentColor(
                                template.environment
                              )}
                            >
                              {template.environment}
                            </Badge>
                            <Badge variant="outline">
                              {getSeverityLevel(template)}
                            </Badge>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-4">
                          <div>
                            <h4 className="font-medium text-sm text-gray-700 mb-2">
                              Scanners
                            </h4>
                            <div className="flex flex-wrap gap-1">
                              {template.scannerConfig.scanners.map(
                                (scanner) => (
                                  <Badge
                                    key={scanner}
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {scanner}
                                  </Badge>
                                )
                              )}
                            </div>
                          </div>

                          {template.policyConfig && (
                            <div>
                              <h4 className="font-medium text-sm text-gray-700 mb-2">
                                Policy
                              </h4>
                              <div className="text-sm text-gray-600 space-y-1">
                                <div>
                                  Critical: ≤{" "}
                                  {template.policyConfig.maxCritical}
                                </div>
                                <div>
                                  High: ≤ {template.policyConfig.maxHigh}
                                </div>
                                {template.policyConfig.complianceRequired && (
                                  <div className="text-green-600">
                                    ✓ Compliance required
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingTemplate(template)}
                              className="flex-1"
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Edit
                            </Button>

                            {!template.isDefault && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => deleteTemplate(template.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <CreateTemplateDialog
              open={showCreateDialog}
              onOpenChange={setShowCreateDialog}
              onSuccess={fetchTemplates}
            />

            {editingTemplate && (
              <EditTemplateDialog
                template={editingTemplate}
                open={!!editingTemplate}
                onOpenChange={(open) => {
                  if (!open) {
                    setEditingTemplate(null);
                  }
                }}
                onSuccess={() => {
                  setEditingTemplate(null);
                  fetchTemplates();
                }}
              />
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
