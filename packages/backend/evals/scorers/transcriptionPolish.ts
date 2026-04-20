import { createScorer } from "evalite";

import { isSpeechSource } from "../../src/indexing/logic/contentTypes";

const SPEECH_FILLER_PATTERN = /\b(um|uh|uh huh|uhh|umm|hmm|er|erm)\b/gi;

const STUTTER_PATTERN = /\b(\w+)\s+\1\b/gi;

function countSpeechArtifacts(text: string): number {
  const fillers = text.match(SPEECH_FILLER_PATTERN) ?? [];
  const stutters = text.match(STUTTER_PATTERN) ?? [];
  return fillers.length + stutters.length;
}

export const transcriptionPolish = createScorer<any, any, any>({
  name: "Transcription Polish",
  description:
    "Checks that YouTube/speech-source quote posts have speech artifacts removed while non-speech sources are unaffected",
  scorer: async ({ output }) => {
    if (output.postType !== "quote") {
      return { score: 1, metadata: { rationale: "Not a quote post, skipping" } };
    }

    if (!isSpeechSource(output.fileType)) {
      return { score: 1, metadata: { rationale: "Not a speech source, skipping" } };
    }

    const quotedText: string = output.typeData?.quotedText ?? "";
    if (!quotedText) {
      return { score: 0, metadata: { rationale: "No quoted text found" } };
    }

    const artifactCount = countSpeechArtifacts(quotedText);

    if (artifactCount === 0) {
      return { score: 1, metadata: { rationale: "No speech artifacts detected in quoted text" } };
    }

    const words = quotedText.split(/\s+/).length;
    const artifactDensity = artifactCount / words;

    if (artifactDensity > 0.1) {
      return {
        score: 0,
        metadata: {
          rationale: `High speech artifact density: ${artifactCount} artifacts in ${words} words (${(artifactDensity * 100).toFixed(1)}%)`,
          artifactCount,
        },
      };
    }

    return {
      score: 0.5,
      metadata: {
        rationale: `Some speech artifacts remain: ${artifactCount} in ${words} words`,
        artifactCount,
      },
    };
  },
});
