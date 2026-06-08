import DOMPurify from 'dompurify';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

const markdownSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https'],
  },
  attributes: {
    ...defaultSchema.attributes,
    a: [
      ...(defaultSchema.attributes?.a || []),
      'title',
    ],
    code: [
      ...(defaultSchema.attributes?.code || []),
      ['className', /^language-./, 'math-inline', 'math-display'],
    ],
    img: [
      ...(defaultSchema.attributes?.img || []),
      'alt',
      'title',
      'width',
      'height',
    ],
  },
} as typeof defaultSchema;

const allowedHtmlTags = [
  'a', 'address', 'article', 'aside', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup', 'dd', 'del',
  'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'main', 'mark', 'ol', 'p', 'pre', 's', 'section', 'small',
  'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul',
];

const allowedHtmlAttributes = ['aria-label', 'alt', 'height', 'href', 'loading', 'name', 'rel', 'src', 'target', 'title', 'width'];

function isAllowedUrl(value: string, allowed: string[]) {
  if (!value) return true;
  if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../') || value.startsWith('#')) return true;
  try {
    const url = new URL(value, window.location.origin);
    return allowed.includes(url.protocol.replace(':', ''));
  } catch {
    return false;
  }
}

function hardenHtmlUrls(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('a[href]').forEach((element) => {
    const href = element.getAttribute('href') || '';
    if (!isAllowedUrl(href, ['http', 'https', 'mailto'])) {
      element.removeAttribute('href');
      return;
    }
    element.setAttribute('target', '_blank');
    element.setAttribute('rel', 'nofollow noopener noreferrer');
  });
  doc.querySelectorAll('img[src]').forEach((element) => {
    const src = element.getAttribute('src') || '';
    if (!isAllowedUrl(src, ['http', 'https'])) element.removeAttribute('src');
    else element.setAttribute('loading', 'lazy');
  });
  return doc.body.innerHTML;
}

export function sanitizeHtmlForClient(html: string) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: allowedHtmlTags,
    ALLOWED_ATTR: allowedHtmlAttributes,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'button'],
    FORBID_ATTR: ['style', 'srcdoc', 'onerror', 'onload', 'onclick'],
  });
  return hardenHtmlUrls(String(clean));
}

export function plaintextFromHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function urlTransform(url: string, key: string) {
  if (key === 'src') return isAllowedUrl(url, ['http', 'https']) ? url : undefined;
  if (key === 'href') return isAllowedUrl(url, ['http', 'https', 'mailto']) ? url : undefined;
  return url;
}

export function MarkdownView({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeSanitize, markdownSchema], rehypeKatex, rehypeHighlight]}
      urlTransform={urlTransform}
      components={{
        a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="nofollow noopener noreferrer" />,
        img: ({ node: _node, ...props }) => <img {...props} loading="lazy" alt={props.alt || ''} />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function HtmlView({ content }: { content: string }) {
  return <div dangerouslySetInnerHTML={{ __html: sanitizeHtmlForClient(content) }} />;
}
