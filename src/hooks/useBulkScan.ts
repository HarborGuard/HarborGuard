import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { ScannerInfo } from "@/types";

interface BulkScanJob {
  id: string;
  name?: string;
  totalImages: number;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "PAUSED";
  patterns: {
    imagePattern?: string;
    tagPattern?: string;
    registryPattern?: string;
  };
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
  _count: {
    items: number;
  };
  summary?: {
    completed: number;
    failed: number;
    running: number;
  };
}

interface BulkScanFormData {
  name: string;
  imagePattern: string;
  tagPattern: string;
  registryPattern: string;
  excludeTagPattern: string;
  maxImages: number;
  enableTrivy: boolean;
  enableGrype: boolean;
  enableSyft: boolean;
  enableDockle: boolean;
  enableOsv: boolean;
  enableDive: boolean;
}

const initialFormData: BulkScanFormData = {
  name: "",
  imagePattern: "",
  tagPattern: "",
  registryPattern: "",
  excludeTagPattern: "",
  maxImages: 100,
  enableTrivy: true,
  enableGrype: true,
  enableSyft: true,
  enableDockle: true,
  enableOsv: false,
  enableDive: false,
};

export function useBulkScan(open: boolean) {
  const [jobs, setJobs] = useState<BulkScanJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [scannerAvailability, setScannerAvailability] = useState<ScannerInfo[]>([]);
  const [formData, setFormData] = useState<BulkScanFormData>({ ...initialFormData });

  // Fetch scanner availability
  const fetchScannerAvailability = async () => {
    try {
      const response = await fetch("/api/scanners/available");
      const result = await response.json();

      if (result.success) {
        setScannerAvailability(result.scanners);

        // Update form data to pre-check available scanners
        setFormData(prev => {
          const updated = { ...prev };
          result.scanners.forEach((scanner: ScannerInfo) => {
            const key = `enable${scanner.name.charAt(0).toUpperCase()}${scanner.name.slice(1)}`;
            // Type-safe update for boolean scanner fields
            switch(key) {
              case 'enableTrivy':
              case 'enableGrype':
              case 'enableSyft':
              case 'enableDockle':
              case 'enableOsv':
              case 'enableDive':
                updated[key] = scanner.available;
                break;
            }
          });
          return updated;
        });
      }
    } catch (error) {
      console.error("Error fetching scanner availability:", error);
    }
  };

  // Fetch bulk scan jobs
  const fetchJobs = async () => {
    setJobsLoading(true);
    try {
      const response = await fetch("/api/scans/bulk");
      const result = await response.json();

      if (result.success) {
        // Get detailed status for running jobs SEQUENTIALLY to avoid database contention
        const jobsWithDetails = [];
        for (const job of result.data) {
          if (job.status === "RUNNING") {
            try {
              const statusResponse = await fetch(`/api/scans/bulk/${job.id}`);
              const statusResult = await statusResponse.json();
              if (statusResult.success) {
                jobsWithDetails.push({ ...job, summary: statusResult.data.summary });
              } else {
                jobsWithDetails.push(job);
              }
            } catch (error) {
              console.error(`Failed to fetch status for job ${job.id}:`, error);
              jobsWithDetails.push(job);
            }
          } else {
            jobsWithDetails.push(job);
          }
        }

        setJobs(jobsWithDetails);
      } else {
        toast.error("Failed to fetch bulk scan jobs");
      }
    } catch (error) {
      console.error("Error fetching bulk scan jobs:", error);
      toast.error("Failed to fetch bulk scan jobs");
    } finally {
      setJobsLoading(false);
    }
  };

  // Load jobs and scanner availability when dialog opens
  useEffect(() => {
    if (open) {
      fetchJobs();
      fetchScannerAvailability();
    }
  }, [open]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent): Promise<boolean> => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/scans/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name.trim() || undefined,
          patterns: {
            imagePattern: formData.imagePattern.trim() || undefined,
            tagPattern: formData.tagPattern.trim() || undefined,
            registryPattern: formData.registryPattern.trim() || undefined,
            excludeTagPattern: formData.excludeTagPattern.trim() || undefined,
          },
          options: {
            maxImages: formData.maxImages,
            scanners: {
              trivy: formData.enableTrivy,
              grype: formData.enableGrype,
              syft: formData.enableSyft,
              dockle: formData.enableDockle,
              osv: formData.enableOsv,
              dive: formData.enableDive,
            },
          },
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(
          `Bulk scan started with ${result.data.totalImages} images`
        );

        // Reset form
        setFormData({ ...initialFormData });

        // Refresh jobs after a short delay to allow backend to start queueing scans
        setTimeout(() => fetchJobs(), 2000);
        return true;
      } else {
        toast.error(result.error || "Failed to start bulk scan");
        return false;
      }
    } catch (error) {
      console.error("Error starting bulk scan:", error);
      toast.error("Failed to start bulk scan");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return {
    jobs,
    loading,
    jobsLoading,
    scannerAvailability,
    formData,
    handleSubmit,
    handleInputChange,
    fetchJobs,
  };
}

export type { BulkScanJob, BulkScanFormData };
