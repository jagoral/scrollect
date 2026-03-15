import { createFileRoute } from "@tanstack/react-router";
import { FileText, FileUp, Globe } from "lucide-react";

import { UploadFileTab } from "@/components/upload/upload-file-tab";
import { UploadUrlTab } from "@/components/upload/upload-url-tab";
import { UploadTextTab } from "@/components/upload/upload-text-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({
    meta: [{ title: "Upload | Scrollect" }],
  }),
  component: UploadPage,
});

function UploadPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Upload Content</h1>
        <p className="mt-1 text-muted-foreground">
          Upload files, paste a URL, or add text to your library.
        </p>
      </div>

      <Tabs defaultValue="file" data-testid="upload-tabs">
        <TabsList className="mb-6 grid w-full grid-cols-3">
          <TabsTrigger value="file" data-testid="tab-file" className="gap-2">
            <FileUp className="h-4 w-4" />
            Upload File
          </TabsTrigger>
          <TabsTrigger value="url" data-testid="tab-url" className="gap-2">
            <Globe className="h-4 w-4" />
            Paste URL
          </TabsTrigger>
          <TabsTrigger value="text" data-testid="tab-text" className="gap-2">
            <FileText className="h-4 w-4" />
            Paste Text
          </TabsTrigger>
        </TabsList>

        <TabsContent value="file">
          <UploadFileTab />
        </TabsContent>

        <TabsContent value="url">
          <UploadUrlTab />
        </TabsContent>

        <TabsContent value="text">
          <UploadTextTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
