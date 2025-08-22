"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Activity, CheckCircle, XCircle } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { LoadingState } from "@/components/ui/loading";

interface BulkScanDetails {
  id: string;
  name?: string;
  totalImages: number;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  patterns: {
    imagePattern?: string;
    tagPattern?: string;
    registryPattern?: string;
  };
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
  summary: {
    completed: number;
    failed: number;
    running: number;
  };
  items: Array<{
    id: string;
    status: string;
    scanId: string;
    image: {
      name: string;
      tag: string;
      registry: string;
    };
  }>;
}

export default function BulkScanDetailsPage() {
  const params = useParams();
  const [details, setDetails] = useState<BulkScanDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = async () => {
    try {
      const response = await fetch(`/api/scans/bulk/${params.id}`);
      const result = await response.json();
      
      if (result.success) {
        setDetails(result.data);
      } else {
        setError(result.error || "Failed to load bulk scan details");
      }
    } catch (err) {
      setError("Failed to load bulk scan details");
      console.error("Error fetching bulk scan details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
    
    // Poll for updates if scan is running
    const interval = setInterval(() => {
      if (details?.status === "RUNNING") {
        fetchDetails();
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [params.id, details?.status]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "RUNNING":
        return "bg-blue-100 text-blue-800";
      case "SUCCESS":
        return "bg-green-100 text-green-800";
      case "COMPLETED":
        return "bg-green-100 text-green-800";
      case "FAILED":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "RUNNING":
        return <Activity className="h-4 w-4" />;
      case "SUCCESS":
      case "COMPLETED":
        return <CheckCircle className="h-4 w-4" />;
      case "FAILED":
        return <XCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <SidebarProvider>
        <AppSidebar variant="inset" />
        <SidebarInset className="flex flex-col">
          <SiteHeader />
          <div className="flex-1 overflow-auto">
            <div className="container mx-auto py-8">
              <LoadingState 
                message="Loading Bulk Scan Details" 
                description="Fetching scan progress and results..."
                size="lg"
                className="min-h-[400px]"
              />
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  if (error || !details) {
    return (
      <SidebarProvider>
        <AppSidebar variant="inset" />
        <SidebarInset className="flex flex-col">
          <SiteHeader />
          <div className="flex-1 overflow-auto">
            <div className="container mx-auto py-8">
              <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                  <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Error Loading Details
                  </h3>
                  <p className="text-gray-500 mb-4">{error}</p>
                  <Button onClick={() => window.history.back()}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Go Back
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: "Bulk Scan", href: "/bulk-scan" },
    { label: details.name || `Scan ${details.id.slice(0, 8)}`, href: `/bulk-scan/${details.id}` },
  ];

  return (
    <SidebarProvider>
      <AppSidebar variant="inset" />
      <SidebarInset className="flex flex-col">
        <SiteHeader breadcrumbs={breadcrumbs} />
        <div className="flex-1 overflow-auto">
          <div className="@container/main flex flex-col gap-2 p-4 lg:p-6">
            <div className="flex items-center gap-4 mb-6">
              <Button 
                variant="outline" 
                onClick={() => window.history.back()}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  {getStatusIcon(details.status)}
                  {details.name || `Bulk Scan ${details.id.slice(0, 8)}`}
                </h1>
                <p className="text-gray-600 mt-1">
                  Started {new Date(details.createdAt).toLocaleString()}
                </p>
              </div>
              <Badge className={getStatusColor(details.status)}>
                {details.status}
              </Badge>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Progress</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span>Completion</span>
                      <span>{details.summary.completed}/{details.totalImages}</span>
                    </div>
                    <Progress 
                      value={(details.summary.completed / details.totalImages) * 100} 
                      className="w-full"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                      <div className="font-medium text-green-600">{details.summary.completed}</div>
                      <div className="text-gray-500">Completed</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium text-blue-600">{details.summary.running}</div>
                      <div className="text-gray-500">Running</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium text-red-600">{details.summary.failed}</div>
                      <div className="text-gray-500">Failed</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Patterns</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {details.patterns.imagePattern && (
                    <div>
                      <span className="text-sm text-gray-500">Image:</span>
                      <Badge variant="outline" className="ml-2">{details.patterns.imagePattern}</Badge>
                    </div>
                  )}
                  {details.patterns.tagPattern && (
                    <div>
                      <span className="text-sm text-gray-500">Tag:</span>
                      <Badge variant="outline" className="ml-2">{details.patterns.tagPattern}</Badge>
                    </div>
                  )}
                  {details.patterns.registryPattern && (
                    <div>
                      <span className="text-sm text-gray-500">Registry:</span>
                      <Badge variant="outline" className="ml-2">{details.patterns.registryPattern}</Badge>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Total Images:</span>
                    <span className="font-medium">{details.totalImages}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Success Rate:</span>
                    <span className="font-medium">
                      {details.totalImages > 0 
                        ? Math.round((details.summary.completed / details.totalImages) * 100)
                        : 0
                      }%
                    </span>
                  </div>
                  {details.completedAt && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Completed:</span>
                      <span className="font-medium">
                        {new Date(details.completedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {details.items && details.items.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Individual Scans</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {details.items.map((item) => (
                      <div 
                        key={item.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {getStatusIcon(item.status)}
                          <div>
                            <div className="font-medium">
                              {item.image.registry}/{item.image.name}:{item.image.tag}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(item.status)}>
                            {item.status}
                          </Badge>
                          {item.scanId && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => window.open(`/image/${item.image.name}/scan/${item.scanId}`, '_blank')}
                            >
                              View Scan
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}