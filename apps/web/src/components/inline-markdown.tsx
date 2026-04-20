import { Fragment } from "react";
import Markdown from "react-markdown";

interface InlineMarkdownProps {
  children: string;
}

export function InlineMarkdown({ children }: InlineMarkdownProps) {
  return (
    <Markdown
      components={{
        p: ({ children }) => <Fragment>{children}</Fragment>,
      }}
      allowedElements={["p", "strong", "em", "code", "del"]}
      unwrapDisallowed
    >
      {children}
    </Markdown>
  );
}
