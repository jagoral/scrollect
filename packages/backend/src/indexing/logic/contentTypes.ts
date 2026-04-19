const SPEECH_SOURCE_FILE_TYPES = new Set(["youtube"]);

export function isSpeechSource(fileType?: string): boolean {
  return fileType != null && SPEECH_SOURCE_FILE_TYPES.has(fileType);
}
