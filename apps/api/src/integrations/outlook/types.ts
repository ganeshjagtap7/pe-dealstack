// Microsoft Graph mail shapes (subset we consume). Full schema:
// https://learn.microsoft.com/graph/api/resources/message

export interface GraphEmailAddress {
  name?: string;
  address?: string;
}

export interface GraphRecipient {
  emailAddress?: GraphEmailAddress;
}

export interface GraphMessage {
  id: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  conversationId?: string;
  internetMessageId?: string;
  from?: GraphRecipient;
  sender?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  body?: { contentType?: 'text' | 'html'; content?: string };
}

export interface GraphListResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
}
