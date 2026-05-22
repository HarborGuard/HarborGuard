"use client";

import * as React from "react";
import { Layers } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DiveReport } from "@/types";

interface DiveResultsTabProps {
  diveResults: DiveReport;
}

export function DiveResultsTab({ diveResults }: DiveResultsTabProps) {
  const [selectedLayer, setSelectedLayer] = React.useState<string>("0");

  return (
    <Card className="bg-surface-1 border-white/10 rounded-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-body-sm uppercase tracking-caps text-foreground">
          <Layers className="h-4 w-4 text-accent" />
          Layer Analysis
        </CardTitle>
        <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/50">
          Docker image layer breakdown and file system analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs
          value={selectedLayer}
          onValueChange={setSelectedLayer}
          className="w-full"
        >
          <TabsList className="flex w-full flex-wrap gap-1 h-auto p-0 rounded-none border border-white/10 bg-surface-1">
            {diveResults.layer.map((layer, index) => (
              <TabsTrigger
                key={index}
                value={index.toString()}
                className="flex items-center gap-1 text-caption uppercase tracking-widest px-2 py-1.5 flex-shrink-0 min-w-fit rounded-none data-[state=active]:bg-white/5"
              >
                <Layers className="h-3 w-3" />
                Layer {layer.index + 1}
                <Badge variant="secondary" className="rounded-none uppercase tracking-widest text-caption ml-1">
                  {(Number(layer.sizeBytes) / (1024 * 1024)).toFixed(1)}MB
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          {diveResults.layer.map((layer, index) => (
            <TabsContent
              key={index}
              value={index.toString()}
              className="space-y-4"
            >
              <div className="border border-white/10 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="rounded-none uppercase tracking-widest text-caption border-white/10">
                      Layer {layer.index + 1}
                    </Badge>
                    <span className="text-caption uppercase tracking-widest text-muted-foreground/50">
                      {(Number(layer.sizeBytes) / (1024 * 1024)).toFixed(2)}{" "}
                      MB
                    </span>
                  </div>
                  <Badge variant="secondary" className="rounded-none uppercase tracking-widest text-caption">
                    {layer.fileList.length} files
                  </Badge>
                </div>

                <div className="mb-3">
                  <p className="text-caption uppercase tracking-widest text-muted-foreground/60 mb-1">Command:</p>
                  <code className="text-xs bg-surface-1 border border-white/10 p-2 block overflow-x-auto text-muted-foreground">
                    {layer.command}
                  </code>
                </div>

                <div className="mb-3">
                  <p className="text-caption uppercase tracking-widest text-muted-foreground/60 mb-1">
                    Layer ID:
                  </p>
                  <code className="text-xs text-muted-foreground/60 font-mono">
                    {layer.digestId}
                  </code>
                </div>

                {layer.fileList.length > 0 && (
                  <div>
                    <p className="text-caption uppercase tracking-widest text-muted-foreground/60 mb-2">
                      Files ({layer.fileList.length}):
                    </p>
                    <div className="max-h-96 overflow-y-auto border border-white/10">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/10 bg-surface-1">
                            <th className="text-left p-2 text-caption uppercase tracking-widest text-muted-foreground/60">
                              Path
                            </th>
                            <th className="text-left p-2 text-caption uppercase tracking-widest text-muted-foreground/60">
                              Size
                            </th>
                            <th className="text-left p-2 text-caption uppercase tracking-widest text-muted-foreground/60">
                              Mode
                            </th>
                            <th className="text-left p-2 text-caption uppercase tracking-widest text-muted-foreground/60">
                              Owner
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {layer.fileList.map((file, fileIndex) => (
                            <tr
                              key={fileIndex}
                              className="border-b border-white/10 hover:bg-white/5"
                            >
                              <td className="p-2 font-mono text-muted-foreground/80">
                                {file.path}
                                {file.linkName && (
                                  <span className="text-muted-foreground/40 ml-1">
                                    {"→"} {file.linkName}
                                  </span>
                                )}
                              </td>
                              <td className="p-2 text-muted-foreground/60">
                                {file.size > 0
                                  ? `${(file.size / 1024).toFixed(
                                      1
                                    )}KB`
                                  : "-"}
                              </td>
                              <td className="p-2 font-mono text-muted-foreground/60">
                                {file.fileMode.toString(8).slice(-4)}
                              </td>
                              <td className="p-2 text-muted-foreground/60">
                                {file.uid}:{file.gid}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
