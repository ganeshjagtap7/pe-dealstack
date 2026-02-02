-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.Activity (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  dealId uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  description text,
  metadata jsonb,
  createdAt timestamp with time zone DEFAULT now(),
  userId uuid,
  scheduledAt timestamp with time zone,
  completedAt timestamp with time zone,
  participants ARRAY,
  CONSTRAINT Activity_pkey PRIMARY KEY (id),
  CONSTRAINT Activity_dealId_fkey FOREIGN KEY (dealId) REFERENCES public.Deal(id),
  CONSTRAINT Activity_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id)
);
CREATE TABLE public.AuditLog (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  userId uuid,
  action text NOT NULL,
  entityType text NOT NULL,
  entityId uuid,
  changes jsonb,
  ipAddress text,
  userAgent text,
  createdAt timestamp with time zone DEFAULT now(),
  CONSTRAINT AuditLog_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ChatMessage (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversationId uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  metadata jsonb,
  createdAt timestamp with time zone DEFAULT now(),
  CONSTRAINT ChatMessage_pkey PRIMARY KEY (id),
  CONSTRAINT ChatMessage_conversationId_fkey FOREIGN KEY (conversationId) REFERENCES public.Conversation(id)
);
CREATE TABLE public.Company (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  industry text,
  description text,
  website text,
  createdAt timestamp with time zone DEFAULT now(),
  updatedAt timestamp with time zone DEFAULT now(),
  logo text,
  headquarters text,
  foundedYear integer,
  employeeCount integer,
  annualRevenue double precision,
  linkedinUrl text,
  CONSTRAINT Company_pkey PRIMARY KEY (id)
);
CREATE TABLE public.Contact (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  companyId uuid NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  title text,
  department text,
  isPrimary boolean DEFAULT false,
  notes text,
  avatar text,
  createdAt timestamp with time zone DEFAULT now(),
  updatedAt timestamp with time zone DEFAULT now(),
  CONSTRAINT Contact_pkey PRIMARY KEY (id),
  CONSTRAINT Contact_companyId_fkey FOREIGN KEY (companyId) REFERENCES public.Company(id)
);
CREATE TABLE public.Conversation (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  dealId uuid,
  userId uuid NOT NULL,
  title text,
  createdAt timestamp with time zone DEFAULT now(),
  updatedAt timestamp with time zone DEFAULT now(),
  CONSTRAINT Conversation_pkey PRIMARY KEY (id),
  CONSTRAINT Conversation_dealId_fkey FOREIGN KEY (dealId) REFERENCES public.Deal(id),
  CONSTRAINT Conversation_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id)
);
CREATE TABLE public.Deal (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  companyId uuid NOT NULL,
  stage text NOT NULL DEFAULT 'INITIAL_REVIEW'::text,
  status text NOT NULL DEFAULT 'ACTIVE'::text,
  irrProjected double precision,
  mom double precision,
  ebitda double precision,
  revenue double precision,
  industry text,
  dealSize double precision,
  description text,
  aiThesis text,
  icon text DEFAULT 'business_center'::text,
  lastDocument text,
  lastDocumentUpdated timestamp with time zone,
  createdAt timestamp with time zone DEFAULT now(),
  updatedAt timestamp with time zone DEFAULT now(),
  assignedTo uuid,
  priority text DEFAULT 'MEDIUM'::text,
  targetCloseDate date,
  actualCloseDate date,
  source text,
  tags ARRAY,
  CONSTRAINT Deal_pkey PRIMARY KEY (id),
  CONSTRAINT Deal_companyId_fkey FOREIGN KEY (companyId) REFERENCES public.Company(id),
  CONSTRAINT Deal_assignedTo_fkey FOREIGN KEY (assignedTo) REFERENCES public.User(id)
);
CREATE TABLE public.DealTeamMember (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  dealId uuid NOT NULL,
  userId uuid NOT NULL,
  role text NOT NULL DEFAULT 'MEMBER'::text,
  addedAt timestamp with time zone DEFAULT now(),
  CONSTRAINT DealTeamMember_pkey PRIMARY KEY (id),
  CONSTRAINT DealTeamMember_dealId_fkey FOREIGN KEY (dealId) REFERENCES public.Deal(id),
  CONSTRAINT DealTeamMember_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id)
);
CREATE TABLE public.Document (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  dealId uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'OTHER'::text,
  fileUrl text,
  fileSize integer,
  mimeType text,
  extractedData jsonb,
  confidence double precision,
  createdAt timestamp with time zone DEFAULT now(),
  updatedAt timestamp with time zone DEFAULT now(),
  folderId uuid,
  uploadedBy uuid,
  aiAnalysis jsonb,
  aiAnalyzedAt timestamp with time zone,
  tags ARRAY,
  isHighlighted boolean DEFAULT false,
  extractedText text,
  status text DEFAULT 'pending'::text,
  CONSTRAINT Document_pkey PRIMARY KEY (id),
  CONSTRAINT Document_dealId_fkey FOREIGN KEY (dealId) REFERENCES public.Deal(id),
  CONSTRAINT Document_folderId_fkey FOREIGN KEY (folderId) REFERENCES public.Folder(id),
  CONSTRAINT Document_uploadedBy_fkey FOREIGN KEY (uploadedBy) REFERENCES public.User(id)
);
CREATE TABLE public.Folder (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  dealId uuid NOT NULL,
  parentId uuid,
  name text NOT NULL,
  description text,
  fileCount integer DEFAULT 0,
  isRestricted boolean DEFAULT false,
  sortOrder integer DEFAULT 0,
  createdBy uuid,
  createdAt timestamp with time zone DEFAULT now(),
  updatedAt timestamp with time zone DEFAULT now(),
  CONSTRAINT Folder_pkey PRIMARY KEY (id),
  CONSTRAINT Folder_dealId_fkey FOREIGN KEY (dealId) REFERENCES public.Deal(id),
  CONSTRAINT Folder_parentId_fkey FOREIGN KEY (parentId) REFERENCES public.Folder(id),
  CONSTRAINT Folder_createdBy_fkey FOREIGN KEY (createdBy) REFERENCES public.User(id)
);
CREATE TABLE public.FolderInsight (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  folderId uuid NOT NULL,
  summary text,
  completionPercent integer DEFAULT 0,
  redFlags jsonb DEFAULT '[]'::jsonb,
  missingDocuments jsonb DEFAULT '[]'::jsonb,
  generatedAt timestamp with time zone DEFAULT now(),
  CONSTRAINT FolderInsight_pkey PRIMARY KEY (id),
  CONSTRAINT FolderInsight_folderId_fkey FOREIGN KEY (folderId) REFERENCES public.Folder(id)
);
CREATE TABLE public.Memo (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  dealId uuid,
  title text NOT NULL,
  projectName text,
  type text DEFAULT 'IC_MEMO'::text CHECK (type = ANY (ARRAY['IC_MEMO'::text, 'TEASER'::text, 'SUMMARY'::text, 'CUSTOM'::text])),
  status text DEFAULT 'DRAFT'::text CHECK (status = ANY (ARRAY['DRAFT'::text, 'REVIEW'::text, 'FINAL'::text, 'ARCHIVED'::text])),
  sponsor text,
  memoDate date,
  version integer DEFAULT 1,
  createdBy uuid,
  lastEditedBy uuid,
  collaborators ARRAY DEFAULT '{}'::uuid[],
  complianceChecked boolean DEFAULT false,
  complianceNotes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  createdAt timestamp with time zone DEFAULT now(),
  updatedAt timestamp with time zone DEFAULT now(),
  CONSTRAINT Memo_pkey PRIMARY KEY (id),
  CONSTRAINT Memo_dealId_fkey FOREIGN KEY (dealId) REFERENCES public.Deal(id),
  CONSTRAINT Memo_createdBy_fkey FOREIGN KEY (createdBy) REFERENCES public.User(id),
  CONSTRAINT Memo_lastEditedBy_fkey FOREIGN KEY (lastEditedBy) REFERENCES public.User(id)
);
CREATE TABLE public.MemoChatMessage (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversationId uuid NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  createdAt timestamp with time zone DEFAULT now(),
  CONSTRAINT MemoChatMessage_pkey PRIMARY KEY (id),
  CONSTRAINT MemoChatMessage_conversationId_fkey FOREIGN KEY (conversationId) REFERENCES public.MemoConversation(id)
);
CREATE TABLE public.MemoConversation (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  memoId uuid NOT NULL,
  userId uuid,
  title text,
  createdAt timestamp with time zone DEFAULT now(),
  updatedAt timestamp with time zone DEFAULT now(),
  CONSTRAINT MemoConversation_pkey PRIMARY KEY (id),
  CONSTRAINT MemoConversation_memoId_fkey FOREIGN KEY (memoId) REFERENCES public.Memo(id),
  CONSTRAINT MemoConversation_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id)
);
CREATE TABLE public.MemoSection (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  memoId uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['EXECUTIVE_SUMMARY'::text, 'COMPANY_OVERVIEW'::text, 'FINANCIAL_PERFORMANCE'::text, 'MARKET_DYNAMICS'::text, 'COMPETITIVE_LANDSCAPE'::text, 'RISK_ASSESSMENT'::text, 'DEAL_STRUCTURE'::text, 'VALUE_CREATION'::text, 'EXIT_STRATEGY'::text, 'RECOMMENDATION'::text, 'APPENDIX'::text, 'CUSTOM'::text])),
  title text NOT NULL,
  content text,
  aiGenerated boolean DEFAULT false,
  aiModel text,
  aiPrompt text,
  sortOrder integer NOT NULL DEFAULT 0,
  citations jsonb DEFAULT '[]'::jsonb,
  tableData jsonb,
  chartConfig jsonb,
  status text DEFAULT 'DRAFT'::text CHECK (status = ANY (ARRAY['DRAFT'::text, 'APPROVED'::text, 'NEEDS_REVIEW'::text])),
  createdAt timestamp with time zone DEFAULT now(),
  updatedAt timestamp with time zone DEFAULT now(),
  CONSTRAINT MemoSection_pkey PRIMARY KEY (id),
  CONSTRAINT MemoSection_memoId_fkey FOREIGN KEY (memoId) REFERENCES public.Memo(id)
);
CREATE TABLE public.Notification (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  userId uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  dealId uuid,
  documentId uuid,
  isRead boolean DEFAULT false,
  createdAt timestamp with time zone DEFAULT now(),
  CONSTRAINT Notification_pkey PRIMARY KEY (id),
  CONSTRAINT Notification_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id),
  CONSTRAINT Notification_dealId_fkey FOREIGN KEY (dealId) REFERENCES public.Deal(id)
);
CREATE TABLE public.User (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  authId uuid UNIQUE,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  avatar text,
  role text NOT NULL DEFAULT 'MEMBER'::text,
  department text,
  title text,
  phone text,
  isActive boolean DEFAULT true,
  lastLoginAt timestamp with time zone,
  createdAt timestamp with time zone DEFAULT now(),
  updatedAt timestamp with time zone DEFAULT now(),
  CONSTRAINT User_pkey PRIMARY KEY (id)
);