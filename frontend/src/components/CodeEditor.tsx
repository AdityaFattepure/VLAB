import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage } from '@codemirror/language';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import type { Extension } from '@codemirror/state';
import { cn } from '../lib/format';

function languageForPath(path: string): Extension[] {
  const name = path.split('/').pop()?.toLowerCase() ?? '';

  if (name === 'dockerfile' || name.endsWith('.dockerfile')) {
    return [StreamLanguage.define(dockerFile)];
  }
  if (name.endsWith('.html') || name.endsWith('.htm') || name.endsWith('.xml')) {
    return [html()];
  }
  if (
    name.endsWith('.js') ||
    name.endsWith('.jsx') ||
    name.endsWith('.ts') ||
    name.endsWith('.tsx') ||
    name.endsWith('.json')
  ) {
    return [javascript({ jsx: true, typescript: true })];
  }
  if (name.endsWith('.py')) {
    return [python()];
  }
  if (name.endsWith('.yml') || name.endsWith('.yaml')) {
    return [yaml()];
  }
  if (name.endsWith('.sh') || name.endsWith('.bash')) {
    return [StreamLanguage.define(shell)];
  }
  return [];
}

export function CodeEditor({
  value,
  path,
  readOnly = false,
  onChange,
  className,
}: {
  value: string;
  path: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('h-full min-h-0 overflow-hidden bg-white', className)}>
      <CodeMirror
        value={value}
        height="100%"
        theme="light"
        editable={!readOnly}
        readOnly={readOnly}
        extensions={languageForPath(path)}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
          autocompletion: !readOnly,
          closeBrackets: !readOnly,
        }}
        className="h-full text-[13px]"
      />
    </div>
  );
}
