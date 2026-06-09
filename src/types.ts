export type ContentType = 'markdown' | 'html';
export type Visibility = 'public' | 'unlisted' | 'private';

export type PasteSummary = {
  slug: string;
  title: string;
  excerpt: string;
  content_type: ContentType;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
  is_owner: boolean;
  is_admin: boolean;
  can_edit: boolean;
  can_delete: boolean;
  url: string;
};

export type Paste = {
  slug: string;
  title: string;
  content: string;
  content_type: ContentType;
  visibility: Visibility;
  sanitized: boolean;
  created_at: string;
  updated_at: string;
  is_owner: boolean;
  is_admin: boolean;
  can_edit: boolean;
  can_delete: boolean;
  url: string;
};

export type PasteListResponse = {
  page: number;
  page_size: number;
  total: number;
  is_admin?: boolean;
  admin_view?: boolean;
  pastes: PasteSummary[];
};

export type PasteDraft = {
  title: string;
  content: string;
  content_type: ContentType;
  visibility: Visibility;
};

export type PasteCreateResponse = {
  slug: string;
  title: string;
  content_type: ContentType;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
  url: string;
  remaining?: number;
};

export type UploadImageResponse = {
  url: string;
  path: string;
  remaining?: number;
};
