import { createFileRoute } from "@tanstack/react-router";
import { FileText, FileUp, Globe } from "lucide-react";
import { useCallback, useState } from "react";

import { DocumentUsageMeter } from "@/components/billing/document-usage-meter";
import {
  LearningGoalOnboardingDialog,
  type LearningGoalOnboardingPrompt,
} from "@/components/upload/learning-goal-onboarding-dialog";
import { UploadErrorProvider } from "@/components/upload/upload-error-provider";
import { UploadFileTab } from "@/components/upload/upload-file-tab";
import { UploadUrlTab } from "@/components/upload/upload-url-tab";
import { UploadTextTab } from "@/components/upload/upload-text-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/app/upload")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Upload | Scrollect" }],
  }),
  component: UploadPage,
});

function UploadPage() {
  const [learningGoalPrompts, setLearningGoalPrompts] = useState<LearningGoalOnboardingPrompt[]>(
    [],
  );
  const learningGoalPrompt = learningGoalPrompts[0] ?? null;

  const enqueueLearningGoalPrompt = useCallback((prompt: LearningGoalOnboardingPrompt) => {
    setLearningGoalPrompts((current) => [...current, prompt]);
  }, []);

  const completeLearningGoalPrompt = useCallback(() => {
    setLearningGoalPrompts((current) => current.slice(1));
  }, []);

  return (
    <UploadErrorProvider>
      <div className="px-4 py-6 md:px-6">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Upload Content</h1>
            <p className="mt-1 text-muted-foreground">
              Upload files, paste a URL, or add text to your library.
            </p>
          </div>
          <DocumentUsageMeter />
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
            <UploadFileTab onDocumentCreated={enqueueLearningGoalPrompt} />
          </TabsContent>

          <TabsContent value="url">
            <UploadUrlTab onDocumentCreated={enqueueLearningGoalPrompt} />
          </TabsContent>

          <TabsContent value="text">
            <UploadTextTab onDocumentCreated={enqueueLearningGoalPrompt} />
          </TabsContent>
        </Tabs>
      </div>
      <LearningGoalOnboardingDialog
        prompt={learningGoalPrompt}
        onComplete={completeLearningGoalPrompt}
      />
    </UploadErrorProvider>
  );
}
