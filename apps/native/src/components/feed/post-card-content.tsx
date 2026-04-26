import { ArrowLeftRight, CheckCircle2, Eye, XCircle } from "lucide-react-native";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Pressable, Text, View } from "@/tw";

import type { FeedPost } from "./types";

interface PostCardContentProps {
  post: FeedPost;
}

export function PostCardContent({ post }: PostCardContentProps) {
  const { typeData } = post;
  switch (typeData.type) {
    case "insight":
      return <InsightContent content={post.content} />;
    case "quote":
      return (
        <QuoteContent
          quotedText={typeData.quotedText}
          attribution={typeData.attribution}
          context={post.content}
        />
      );
    case "summary":
      return <SummaryContent bulletPoints={typeData.bulletPoints} fallbackContent={post.content} />;
    case "connection":
      return (
        <ConnectionContent
          sourceATitle={typeData.sourceATitleHint}
          sourceBTitle={typeData.sourceBTitleHint}
          sourceAKeyIdea={typeData.sourceAKeyIdea}
          sourceBKeyIdea={typeData.sourceBKeyIdea}
          summary={post.content}
        />
      );
    case "quiz":
      if (typeData.variant === "multiple_choice") {
        return (
          <QuizMcContent
            question={typeData.question}
            options={typeData.options}
            correctIndex={typeData.correctIndex}
            explanation={typeData.explanation}
          />
        );
      }
      return (
        <QuizRevealContent
          question={typeData.question}
          options={typeData.options}
          correctIndex={typeData.correctIndex}
          explanation={typeData.explanation}
        />
      );
    default:
      typeData satisfies never;
      return null;
  }
}

function InsightContent({ content }: { content: string }) {
  return (
    <Text testID="insight-content" className="text-base leading-6 text-neutral-900">
      {content}
    </Text>
  );
}

interface QuoteContentProps {
  quotedText: string;
  attribution?: string;
  context: string;
}

function QuoteContent({ quotedText, attribution, context }: QuoteContentProps) {
  return (
    <View>
      <Text testID="quoted-text" className="text-2xl font-semibold leading-8 text-neutral-900">
        &ldquo;{quotedText}&rdquo;
      </Text>
      {attribution ? (
        <Text
          testID="quote-attribution"
          className="mt-3 text-xs uppercase tracking-widest text-amber-600"
        >
          &mdash; {attribution}
        </Text>
      ) : null}
      {context ? (
        <Text
          testID="quote-context"
          className="mt-3 border-l-2 border-neutral-200 pl-3 text-sm leading-5 text-neutral-500"
        >
          {context}
        </Text>
      ) : null}
    </View>
  );
}

interface SummaryContentProps {
  bulletPoints: string[];
  fallbackContent: string;
}

function SummaryContent({ bulletPoints, fallbackContent }: SummaryContentProps) {
  if (bulletPoints.length === 0) {
    return (
      <Text testID="summary-content" className="text-base leading-6 text-neutral-900">
        {fallbackContent}
      </Text>
    );
  }
  return (
    <View testID="summary-bullets">
      {bulletPoints.map((point, i) => (
        <View
          key={i}
          className={`flex-row gap-3 py-2 ${i > 0 ? "border-t border-dashed border-neutral-200" : ""}`}
        >
          <Text className="w-7 text-xs font-medium uppercase tracking-wider text-blue-500">
            {String(i + 1).padStart(2, "0")}
          </Text>
          <Text className="flex-1 text-sm leading-5 text-neutral-900">{point}</Text>
        </View>
      ))}
    </View>
  );
}

interface ConnectionContentProps {
  sourceATitle: string;
  sourceBTitle: string;
  sourceAKeyIdea?: string;
  sourceBKeyIdea?: string;
  summary: string;
}

function ConnectionContent({
  sourceATitle,
  sourceBTitle,
  sourceAKeyIdea,
  sourceBKeyIdea,
  summary,
}: ConnectionContentProps) {
  return (
    <View testID="connection-content">
      <View className="mb-4 flex-row items-stretch gap-2">
        <ConnectionSource
          testID="connection-source-a"
          label="Source A"
          title={sourceATitle}
          keyIdea={sourceAKeyIdea}
        />
        <View className="items-center justify-center px-1">
          <ArrowLeftRight size={18} color="#8b5cf6" />
        </View>
        <ConnectionSource
          testID="connection-source-b"
          label="Source B"
          title={sourceBTitle}
          keyIdea={sourceBKeyIdea}
        />
      </View>
      <Text className="text-base leading-6 text-neutral-900">{summary}</Text>
    </View>
  );
}

interface ConnectionSourceProps {
  testID: string;
  label: string;
  title: string;
  keyIdea?: string;
}

function ConnectionSource({ testID, label, title, keyIdea }: ConnectionSourceProps) {
  return (
    <View testID={testID} className="flex-1 border border-neutral-200 bg-violet-500/5 px-3 py-3">
      <Text className="mb-1 text-[10px] font-medium uppercase tracking-widest text-violet-500">
        {label}
      </Text>
      <Text numberOfLines={1} className="text-xs text-neutral-500">
        {title}
      </Text>
      {keyIdea ? (
        <Text className="mt-2 text-xs italic leading-4 text-neutral-700">
          &ldquo;{keyIdea}&rdquo;
        </Text>
      ) : null}
    </View>
  );
}

interface QuizContentProps {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

function QuizMcContent({ question, options, correctIndex, explanation }: QuizContentProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const answered = selectedIndex !== null;

  return (
    <View>
      <Text testID="quiz-question" className="mb-3 text-lg font-semibold text-neutral-900">
        {question}
      </Text>
      <View>
        {options.map((option, i) => {
          const isCorrect = i === correctIndex;
          const isPicked = i === selectedIndex;
          return (
            <Pressable
              key={i}
              testID="quiz-option"
              accessibilityRole="radio"
              accessibilityState={{ selected: isPicked, disabled: answered }}
              disabled={answered}
              onPress={() => {
                if (!answered) setSelectedIndex(i);
              }}
              className={`mb-1.5 flex-row items-center gap-3 border px-3 py-2.5 ${
                answered && isCorrect
                  ? "border-emerald-500/45 bg-emerald-50"
                  : answered && isPicked && !isCorrect
                    ? "border-red-500/45 bg-red-50"
                    : "border-neutral-200 bg-white"
              } ${answered && !isPicked && !isCorrect ? "opacity-50" : ""}`}
            >
              <Text className="w-5 text-xs font-medium tracking-wider text-neutral-500">
                {String.fromCharCode(65 + i)}
              </Text>
              <Text className="flex-1 text-sm text-neutral-900">{option}</Text>
              {answered && isCorrect ? (
                <View className="flex-row items-center gap-1">
                  <CheckCircle2 size={14} color="#059669" />
                  <Text className="text-[10px] font-medium uppercase text-emerald-600">
                    Correct
                  </Text>
                </View>
              ) : null}
              {answered && isPicked && !isCorrect ? (
                <View className="flex-row items-center gap-1">
                  <XCircle size={14} color="#ef4444" />
                  <Text className="text-[10px] font-medium uppercase text-red-500">Your pick</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {answered ? (
        <View
          testID="quiz-explanation"
          className={`mt-3 border px-3 py-2.5 ${
            selectedIndex === correctIndex ? "border-emerald-500/35" : "border-red-500/35"
          }`}
        >
          <Text className="text-sm leading-5 text-neutral-900">{explanation}</Text>
        </View>
      ) : null}
    </View>
  );
}

function QuizRevealContent({ question, options, correctIndex, explanation }: QuizContentProps) {
  const [revealed, setRevealed] = useState(false);
  return (
    <View>
      <Text testID="quiz-question" className="mb-3 text-lg font-semibold text-neutral-900">
        {question}
      </Text>
      {!revealed ? (
        <Button
          testID="quiz-reveal-button"
          variant="secondary"
          size="sm"
          onPress={() => setRevealed(true)}
        >
          <View className="flex-row items-center gap-2">
            <Eye size={14} color="#171717" />
            <Text className="text-sm font-medium text-neutral-900">Reveal answer</Text>
          </View>
        </Button>
      ) : (
        <View testID="quiz-answer" className="border border-emerald-500/35 p-3">
          <Text className="text-base font-semibold text-emerald-700">
            {options[correctIndex] ?? "Answer unavailable"}
          </Text>
          <Text testID="quiz-explanation" className="mt-2 text-sm leading-5 text-neutral-700">
            {explanation}
          </Text>
        </View>
      )}
    </View>
  );
}
