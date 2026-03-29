import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BookOpen, Sparkles, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/onboarding")({
  component: OnboardingFlow,
});

function OnboardingFlow() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  const steps = [
    {
      icon: <BookOpen className="h-12 w-12 text-emerald-500 mb-4" />,
      title: "Welcome to Scrollect",
      description:
        "Your AI-powered knowledge feed. Let's get your library set up so you can start learning.",
      buttonText: "Get Started",
      action: () => setStep(2),
    },
    {
      icon: <Upload className="h-12 w-12 text-blue-500 mb-4" />,
      title: "Upload Your First Document",
      description:
        "Drop in a PDF, EPUB, or paste an article URL. We'll extract the core concepts automatically.",
      buttonText: "Go to Upload",
      action: () => navigate({ to: "/app/upload" }),
    },
    {
      icon: <Sparkles className="h-12 w-12 text-amber-500 mb-4" />,
      title: "Generating Cards...",
      description:
        "Once your document is uploaded, our AI agents will transform it into bite-sized learning cards.",
      buttonText: "View Feed",
      action: () => navigate({ to: "/app/feed" }),
    },
  ];

  const currentStep = steps[step - 1];

  return (
    <div className="flex min-h-[80vh] items-center justify-center p-4">
      <Card className="w-full max-w-md border-muted/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center">{currentStep.icon}</div>
          <CardTitle className="text-2xl">{currentStep.title}</CardTitle>
          <CardDescription className="text-base mt-2">{currentStep.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center pt-6">
          <div className="flex gap-2 mb-8">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full ${i === step ? "bg-emerald-500 w-4" : "bg-muted-foreground/30"} transition-all duration-300`}
              />
            ))}
          </div>
          <Button onClick={currentStep.action} className="w-full" size="lg">
            {currentStep.buttonText}
          </Button>
          {step === 1 && (
            <Button
              variant="ghost"
              className="w-full mt-2 text-muted-foreground"
              onClick={() => navigate({ to: "/app/feed" })}
            >
              Skip for now
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
