// Dropbox Sign text tags — in-document markers that tell Dropbox where to put
// signer fields, instead of letting it auto-place them at the end of the PDF.
//
// Grammar: [type|req/noreq|signerN|label|id]. We only need the first three
// segments. signerN is 1-based (signer1 = the first signer in the request),
// which maps to the 0-based `signers[0]` we send in the client.
//
// These markers only take effect when the request is sent with
// use_text_tags=1 (+ hide_text_tags=1 to whiteout the marker text). See
// integrations/dropboxSign/client.ts → sendSignatureRequest.
// Docs: https://developers.hellosign.com/docs/text-tags/walkthrough/

type TextTagType = 'sig' | 'date' | 'initials' | 'text' | 'checkbox';

// 1-based index of the primary (and, for this prototype, only) signer.
const PRIMARY_SIGNER = 'signer1';

function textTag(
  type: TextTagType,
  required: boolean,
  signer: string = PRIMARY_SIGNER,
): string {
  return `[${type}|${required ? 'req' : 'noreq'}|${signer}]`;
}

// Marker text is rendered white so it's invisible if it survives the Drive
// HTML→Doc conversion; hide_text_tags=1 is the real safety net (Dropbox whites
// out recognized tags in the exported PDF regardless of conversion fidelity).
const HIDDEN = 'color:#ffffff;';

/**
 * HTML signature block appended to the document body just before PDF export
 * (legalDocEsignService → exportLegalDocument.appendHtml). Gives us
 * deterministic placement — a labelled signature + date block at the end of
 * the document — instead of Dropbox's auto-placement.
 *
 * Each text tag sits alone in its own paragraph: that's both a hide_text_tags
 * requirement and what lets Dropbox size each field to the marker. The `sig`
 * marker is enlarged so the resulting signature field is comfortably tall.
 */
export function signatureBlockHtml(): string {
  return [
    '<div style="margin-top:48px;page-break-inside:avoid;">',
    '<p style="margin:0 0 2px;font-weight:bold;">Signature</p>',
    `<p style="margin:0;font-size:26px;line-height:1.1;${HIDDEN}">${textTag(
      'sig',
      true,
    )}</p>`,
    '<p style="margin:16px 0 2px;font-weight:bold;">Date</p>',
    `<p style="margin:0;${HIDDEN}">${textTag('date', true)}</p>`,
    '</div>',
  ].join('');
}
