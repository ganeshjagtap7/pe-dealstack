// Outlook mail calls against Microsoft Graph. OAuth/token helpers live in the
// shared ../microsoft/client.ts (one Azure app backs Outlook + Microsoft 365).

import { graphGet } from '../microsoft/client.js';
import type { GraphListResponse, GraphMessage } from './types.js';

// Minimal scope set for reading mail. `offline_access` is what yields a
// refresh token; the openid/profile/email/User.Read trio identifies the
// connected mailbox.
export const OUTLOOK_SCOPES = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'User.Read',
  'Mail.Read',
];

const MESSAGE_SELECT =
  'id,subject,bodyPreview,receivedDateTime,conversationId,internetMessageId,from,sender,toRecipients,ccRecipients';

// First page of messages received since `since`, newest first. We cap at one
// page (top) in v1 rather than paginating the whole mailbox — a connected
// account's sync runs on a cadence, so each tick only needs the recent slice.
export async function listMessagesSince(
  accessToken: string,
  since: Date,
  top = 50
): Promise<GraphMessage[]> {
  const filter = `receivedDateTime ge ${since.toISOString()}`;
  // Spaces in $orderby ("receivedDateTime desc") must be percent-encoded — a
  // literal space makes the request URL invalid. $filter is encoded too.
  // Both clauses use the same property (receivedDateTime), which Graph mail
  // requires when $filter and $orderby are combined.
  const path =
    `/me/messages?$select=${MESSAGE_SELECT}` +
    `&$filter=${encodeURIComponent(filter)}` +
    `&$orderby=${encodeURIComponent('receivedDateTime desc')}&$top=${top}`;
  const data = await graphGet<GraphListResponse<GraphMessage>>(accessToken, path);
  return data.value ?? [];
}

// Single message including its body, used to feed the classifier on matched
// messages (the list call omits the body to keep payloads small).
export async function getMessageWithBody(
  accessToken: string,
  id: string
): Promise<GraphMessage> {
  const path = `/me/messages/${encodeURIComponent(id)}?$select=${MESSAGE_SELECT},body`;
  return graphGet<GraphMessage>(accessToken, path);
}
