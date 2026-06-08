import { useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type ReactElement } from 'react';
import { uploadImage } from '../lib/api';
import { HtmlView, MarkdownView } from '../lib/markdown';
import type { ContentType, PasteDraft, Visibility } from '../types';

type EditorProps = {
  initial?: Partial<PasteDraft>;
  submitLabel: string;
  isAuthenticated: boolean;
  onSubmit: (draft: PasteDraft) => Promise<void>;
};

type ToolAction = 'heading' | 'bold' | 'italic' | 'link' | 'quote' | 'code' | 'bullet' | 'ordered' | 'task' | 'image';

type IconProps = { className?: string };

const visibilityHelp: Record<Visibility, string> = {
  public: 'Listed publicly and visible by URL.',
  unlisted: 'Only people with the URL can view it.',
  private: 'Only you can view it after sign in.',
};

function IconHeading(props: IconProps) {
  return <svg {...props} viewBox="0 0 16 16"><path d="M4 3.5v9M12 3.5v9M4 8h8" /></svg>;
}

function IconBold(props: IconProps) {
  return <svg {...props} viewBox="0 0 16 16"><path d="M5 3.4v9.2M5 3.4h3.5a2 2 0 0 1 0 4H5M5 7.4h4a2.6 2.6 0 0 1 0 5.2H5" /></svg>;
}

function IconItalic(props: IconProps) {
  return <svg {...props} viewBox="0 0 16 16"><path d="M7 3.4h5M4 12.6h5M10 3.4l-3 9.2" /></svg>;
}

function IconLink(props: IconProps) {
  return <svg {...props} viewBox="0 0 16 16"><g transform="rotate(-60 8 8)"><path d="M6.1 5.9H4.6a2.1 2.1 0 0 0 0 4.2h2.7a2.1 2.1 0 0 0 1.5-.6" /><path d="M9.9 10.1h1.5a2.1 2.1 0 0 0 0-4.2H8.7a2.1 2.1 0 0 0-1.5.6" /><path d="M6.4 8h3.2" /></g></svg>;
}

function IconQuote(props: IconProps) {
  return <svg {...props} viewBox="0 0 16 16"><path d="M6.7 4.2C4.9 5 3.8 6.4 3.8 8.5v3.3h3.6V8H5.6c.1-1 .7-1.9 1.8-2.5" /><path d="M12.5 4.2C10.7 5 9.6 6.4 9.6 8.5v3.3h3.6V8h-1.8c.1-1 .7-1.9 1.8-2.5" /></svg>;
}

function IconCode(props: IconProps) {
  return <svg {...props} viewBox="0 0 16 16"><path d="M5.7 4.8 2.7 8l3 3.2M10.3 4.8l3 3.2-3 3.2M8.8 3.8 7.2 12.2" /></svg>;
}

function IconBullet(props: IconProps) {
  return <svg {...props} viewBox="0 0 16 16"><path d="M5.8 4h7M5.8 8h7M5.8 12h7" /><path d="M3.2 4h.1M3.2 8h.1M3.2 12h.1" /></svg>;
}

function IconOrdered(props: IconProps) {
  return <svg {...props} viewBox="0 0 16 16"><path d="M7 4h6M7 8h6M7 12h6M3.2 3.4h.8v3.1M3 6.5h2M3 9.6c.3-.6.8-.9 1.3-.9.6 0 1 .4 1 1 0 1-2 1.2-2 2.8h2.1" /></svg>;
}

function IconTask(props: IconProps) {
  return <svg {...props} viewBox="0 0 16 16"><rect x="2.7" y="2.9" width="10.6" height="10.6" rx="2" /><path d="M5.2 8.2 7.2 10.2 10.9 5.8" /></svg>;
}

function IconImage(props: IconProps) {
  return <svg {...props} viewBox="0 0 16 16"><rect x="2.5" y="3" width="11" height="10" rx="2" /><circle cx="6" cy="6.1" r="1.1" /><path d="M3.8 11.5 6.4 8.8l1.8 1.8 1.5-1.5 2.5 2.4" /></svg>;
}

const toolGroups: Array<Array<{ action: ToolAction; label: string; icon: (props: IconProps) => ReactElement }>> = [
  [
    { action: 'heading', label: 'Heading', icon: IconHeading },
    { action: 'bold', label: 'Bold', icon: IconBold },
    { action: 'italic', label: 'Italic', icon: IconItalic },
    { action: 'link', label: 'Link', icon: IconLink },
  ],
  [
    { action: 'quote', label: 'Quote', icon: IconQuote },
    { action: 'code', label: 'Code', icon: IconCode },
  ],
  [
    { action: 'bullet', label: 'Bulleted list', icon: IconBullet },
    { action: 'ordered', label: 'Numbered list', icon: IconOrdered },
    { action: 'task', label: 'Task list', icon: IconTask },
  ],
  [
    { action: 'image', label: 'Upload image', icon: IconImage },
  ],
];

function escapeMarkdownLabel(value: string) {
  return value.replace(/([\\[\]])/g, '\\$1');
}

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isImageFile(file: File) {
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type);
}

function stripListPrefix(line: string) {
  const match = line.match(/^(\s*)(?:- \[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)?(.*)$/);
  return { indent: match?.[1] || '', body: match?.[2] || '' };
}

function inferTitleFromContent(content: string) {
  const heading = content.match(/^#\s+(.+)$/m)?.[1];
  return heading ? heading.trim().slice(0, 120) : '';
}

export function Editor({ initial, submitLabel, isAuthenticated, onSubmit }: EditorProps) {
  const [title, setTitle] = useState(initial?.title || '');
  const [content, setContent] = useState(initial?.content || '');
  const [contentType, setContentType] = useState<ContentType>(initial?.content_type || 'markdown');
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility || 'public');
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  function focusRange(start: number, end: number) {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(start, end);
    });
  }

  function replaceRange(start: number, end: number, replacement: string, selectionStart: number, selectionEnd: number) {
    const base = textareaRef.current?.value ?? content;
    const next = `${base.slice(0, start)}${replacement}${base.slice(end)}`;
    setContent(next);
    focusRange(selectionStart, selectionEnd);
  }

  function getSelection() {
    const textarea = textareaRef.current;
    const base = textarea?.value ?? content;
    const start = textarea?.selectionStart ?? base.length;
    const end = textarea?.selectionEnd ?? base.length;
    return { start, end, selected: base.slice(start, end) };
  }

  function wrapSelection(prefix: string, suffix: string, placeholder: string) {
    const { start, end, selected } = getSelection();
    const value = selected || placeholder;
    const replacement = `${prefix}${value}${suffix}`;
    replaceRange(start, end, replacement, start + prefix.length, start + prefix.length + value.length);
  }

  function getSelectedLineRange() {
    const { start, end } = getSelection();
    const base = textareaRef.current?.value ?? content;
    const lineStart = start === 0 ? 0 : base.lastIndexOf('\n', start - 1) + 1;
    const adjustedEnd = end > start && base[end - 1] === '\n' ? end - 1 : end;
    let lineEnd = base.indexOf('\n', adjustedEnd);
    if (lineEnd === -1) lineEnd = base.length;
    return { start: lineStart, end: lineEnd, text: base.slice(lineStart, lineEnd) };
  }

  function formatSelectedLines(transform: (line: string, index: number) => string) {
    const range = getSelectedLineRange();
    const replacement = range.text.split('\n').map(transform).join('\n');
    replaceRange(range.start, range.end, replacement, range.start, range.start + replacement.length);
  }

  function formatHeading() {
    const range = getSelectedLineRange();
    if (!range.text.trim()) {
      replaceRange(range.start, range.end, '# Heading', range.start + 2, range.start + 9);
      return;
    }
    formatSelectedLines((line) => line.trim() ? `# ${line.replace(/^\s{0,3}#{1,6}\s+/, '').trimStart()}` : line);
  }

  function formatLink() {
    const { start, end, selected } = getSelection();
    const trimmed = selected.trim();
    if (/^https?:\/\/\S+$/.test(trimmed)) {
      const label = 'link text';
      const replacement = `[${label}](${trimmed})`;
      replaceRange(start, end, replacement, start + 1, start + 1 + label.length);
      return;
    }
    const label = selected || 'link text';
    const url = 'https://';
    const replacement = `[${label}](${url})`;
    replaceRange(start, end, replacement, selected ? start + label.length + 3 : start + 1, selected ? start + replacement.length - 1 : start + 1 + label.length);
  }

  function formatCode() {
    const { start, end, selected } = getSelection();
    if (!selected.includes('\n')) {
      wrapSelection('`', '`', 'code');
      return;
    }
    const base = textareaRef.current?.value ?? content;
    const leadingBreak = start > 0 && base[start - 1] !== '\n' ? '\n' : '';
    const trailingBreak = end < base.length && base[end] !== '\n' ? '\n' : '';
    const replacement = `${leadingBreak}\`\`\`\n${selected}\n\`\`\`${trailingBreak}`;
    const codeStart = start + leadingBreak.length + 4;
    replaceRange(start, end, replacement, codeStart, codeStart + selected.length);
  }

  async function uploadImages(files: FileList | File[]) {
    const selected = Array.from(files).filter(isImageFile);
    if (!selected.length) {
      setStatus('Only PNG, JPEG, GIF, and WebP images are supported.');
      return;
    }
    setStatus(selected.length > 1 ? `Uploading ${selected.length} images...` : 'Uploading image...');
    try {
      const snippets: string[] = [];
      for (const file of selected) {
        const uploaded = await uploadImage(file);
        const label = file.name || 'image';
        snippets.push(contentType === 'html'
          ? `<img src="${escapeHtmlAttribute(uploaded.url)}" alt="${escapeHtmlAttribute(label)}" loading="lazy">`
          : `![${escapeMarkdownLabel(label)}](${uploaded.url})`);
      }
      const { start, end } = getSelection();
      const base = textareaRef.current?.value ?? content;
      const prefix = start > 0 && base[start - 1] !== '\n' ? '\n' : '';
      const suffix = end < base.length && base[end] !== '\n' ? '\n' : '';
      const replacement = `${prefix}${snippets.join('\n')}${suffix}`;
      replaceRange(start, end, replacement, start + replacement.length, start + replacement.length);
      setStatus(selected.length > 1 ? `${selected.length} images inserted.` : 'Image inserted.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Image upload failed.');
    }
  }

  function applyTool(action: ToolAction) {
    if (action === 'image') {
      imageInputRef.current?.click();
      return;
    }
    if (contentType !== 'markdown') return;
    if (action === 'heading') formatHeading();
    else if (action === 'bold') wrapSelection('**', '**', 'bold text');
    else if (action === 'italic') wrapSelection('*', '*', 'italic text');
    else if (action === 'link') formatLink();
    else if (action === 'quote') formatSelectedLines((line) => line.trim() ? `> ${line.replace(/^>\s?/, '')}` : line);
    else if (action === 'code') formatCode();
    else if (action === 'bullet') formatSelectedLines((line) => {
      const { indent, body } = stripListPrefix(line);
      return `${indent}- ${body}`;
    });
    else if (action === 'ordered') formatSelectedLines((line, index) => {
      const { indent, body } = stripListPrefix(line);
      return `${indent}${index + 1}. ${body}`;
    });
    else if (action === 'task') formatSelectedLines((line) => {
      const { indent, body } = stripListPrefix(line);
      return `${indent}- [ ] ${body}`;
    });
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const images = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!images.length) return;
    event.preventDefault();
    void uploadImages(images);
  }

  function handleDrop(event: DragEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.dataTransfer.files || []);
    if (!files.length) return;
    event.preventDefault();
    void uploadImages(files);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus('');
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim() || inferTitleFromContent(content) || 'Untitled paste',
        content,
        content_type: contentType,
        visibility,
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save paste.');
    } finally {
      setSubmitting(false);
    }
  }

  const privateDisabled = visibility === 'private' && !isAuthenticated;

  return (
    <form className="editor-shell" onSubmit={handleSubmit}>
      <div className="editor-grid">
        <label className="field field-title">
          <span>Title</span>
          <input value={title} maxLength={256} placeholder="Optional title" onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field field-select">
          <span>Type</span>
          <select value={contentType} onChange={(event) => setContentType(event.target.value as ContentType)}>
            <option value="markdown">Markdown</option>
            <option value="html">HTML</option>
          </select>
        </label>
        <label className="field field-select">
          <span>Visibility</span>
          <select value={visibility} onChange={(event) => setVisibility(event.target.value as Visibility)}>
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
          </select>
        </label>
      </div>

      <div className="editor-card">
        <div className="editor-tabs">
          <button type="button" className={activeTab === 'write' ? 'active' : ''} onClick={() => setActiveTab('write')}>Write</button>
          <button type="button" className={activeTab === 'preview' ? 'active' : ''} onClick={() => setActiveTab('preview')}>Preview</button>
          <span className="editor-help">{visibilityHelp[visibility]}</span>
        </div>

        <div className="markdown-toolbar" role="toolbar" aria-label="Formatting tools">
          {toolGroups.map((group, groupIndex) => (
            <span className="tool-group" key={groupIndex}>
              {group.map((tool) => {
                const Icon = tool.icon;
                const disabled = contentType !== 'markdown' && tool.action !== 'image';
                return (
                  <button
                    className="markdown-tool-btn"
                    disabled={disabled}
                    key={tool.action}
                    type="button"
                    title={disabled ? 'Markdown-only tool' : tool.label}
                    aria-label={tool.label}
                    onClick={() => applyTool(tool.action)}
                  >
                    <Icon className="markdown-tool-icon" />
                  </button>
                );
              })}
            </span>
          ))}
          <input
            ref={imageInputRef}
            className="visually-hidden"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            onChange={(event) => {
              if (event.target.files) void uploadImages(event.target.files);
              event.currentTarget.value = '';
            }}
          />
        </div>

        {activeTab === 'write' ? (
          <textarea
            ref={textareaRef}
            value={content}
            required
            maxLength={2 * 1024 * 1024}
            placeholder={contentType === 'markdown' ? 'Paste Markdown here...' : 'Paste HTML here; it will be sanitized on save...'}
            spellCheck={false}
            onChange={(event) => setContent(event.target.value)}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
          />
        ) : (
          <article className="paste-body preview-pane">
            {contentType === 'markdown' ? <MarkdownView content={content || '*Nothing to preview yet.*'} /> : <HtmlView content={content || '<p>Nothing to preview yet.</p>'} />}
          </article>
        )}
      </div>

      <div className="editor-actions">
        <button className="primary-button" type="submit" disabled={submitting || privateDisabled || !content.trim()}>
          {submitting ? 'Saving...' : submitLabel}
        </button>
        {privateDisabled ? <span className="status-message error">Sign in before creating private pastes.</span> : null}
        {status ? <span className="status-message">{status}</span> : null}
      </div>
    </form>
  );
}
