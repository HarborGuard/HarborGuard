"use client";

import * as React from "react";
import { IconStack } from "@tabler/icons-react";

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
    <Card>
      <CardHeader>
        <CardTitle>Layer Analysis</CardTitle>
        <CardDescription>
          Docker image layer breakdown and file system analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs
          value={selectedLayer}
          onValueChange={setSelectedLayer}
          className="w-full"
        >
          <TabsList className="flex w-full flex-wrap gap-1 h-auto p-1">
            {diveResults.layer.map((layer, index) => (
              <TabsTrigger
                key={index}
                value={index.toString()}
                className="flex items-center gap-1 text-xs px-2 py-1.5 flex-shrink-0 min-w-fit"
              >
                <IconStack className="h-3 w-3" />
                Layer {layer.index + 1}
                <Badge variant="secondary" className="text-xs ml-1">
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
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">
                      Layer {layer.index + 1}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {(Number(layer.sizeBytes) / (1024 * 1024)).toFixed(2)}{" "}
                      MB
                    </span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {layer.fileList.length} files
                  </Badge>
                </div>

                <div className="mb-3">
                  <p className="text-sm font-medium mb-1">Command:</p>
                  <code className="text-xs bg-muted p-2 rounded block overflow-x-auto">
                    {layer.command}
                  </code>
                </div>

                <div className="mb-3">
                  <p className="text-sm font-medium mb-2">
                    Layer ID:
                  </p>
                  <code className="text-xs text-muted-foreground font-mono">
                    {layer.digestId}
                  </code>
                </div>

                {layer.fileList.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">
                      Files ({layer.fileList.length}):
                    </p>
                    <div className="max-h-96 overflow-y-auto border rounded">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-2 font-medium">
                              Path
                            </th>
                            <th className="text-left p-2 font-medium">
                              Size
                            </th>
                            <th className="text-left p-2 font-medium">
                              Mode
                            </th>
                            <th className="text-left p-2 font-medium">
                              Owner
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {layer.fileList.map((file, fileIndex) => (
                            <tr
                              key={fileIndex}
                              className="border-b hover:bg-muted/25"
                            >
                              <td className="p-2 font-mono">
                                {file.path}
                                {file.linkName && (
                                  <span className="text-muted-foreground ml-1">
                                    {"\u2192"} {file.linkName}
                                  </span>
                                )}
                              </td>
                              <td className="p-2">
                                {file.size > 0
                                  ? `${(file.size / 1024).toFixed(
                                      1
                                    )}KB`
                                  : "-"}
                              </td>
                              <td className="p-2 font-mono">
                                {file.fileMode.toString(8).slice(-4)}
                              </td>
                              <td className="p-2">
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
