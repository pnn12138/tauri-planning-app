import { useMemo } from "react";

import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";

export default function CodeMirrorEditor(props: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const extensions = useMemo(() => [markdown({ codeLanguages: languages })], []);
  return (
    <CodeMirror
      value={props.value}
      height="100%"
      theme="light"
      extensions={extensions}
      editable={!props.disabled}
      onChange={props.onChange}
    />
  );
}
