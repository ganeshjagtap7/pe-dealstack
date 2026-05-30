// Minimal ambient typing for html-to-docx — the upstream package
// ships no types. In Node it resolves to a Buffer; in the browser
// it resolves to a Blob. Surface as `unknown` and let the caller
// coerce after a runtime check.
declare module 'html-to-docx' {
  export interface HtmlToDocxOptions {
    title?: string;
    margins?: Record<string, number>;
    pageNumber?: boolean;
    footer?: boolean;
    header?: boolean;
    table?: {
      row?: { cantSplit?: boolean };
    };
    orientation?: 'portrait' | 'landscape';
    font?: string;
    fontSize?: number;
    [key: string]: unknown;
  }

  /**
   * Converts an HTML string to a .docx Buffer (Node) or Blob (browser).
   * @param html The HTML source to render.
   * @param headerHtml Optional HTML for the document header.
   * @param documentOptions html-to-docx document-level options.
   * @param footerHtml Optional HTML for the document footer.
   */
  export default function htmlToDocx(
    html: string,
    headerHtml?: string,
    documentOptions?: HtmlToDocxOptions,
    footerHtml?: string,
  ): Promise<Buffer | Blob>;
}
