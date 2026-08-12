import type { DocumentStatus, DocumentType } from "../enums";

export interface VerificationDocument {
  id: string;
  sitterId: string;
  documentType: DocumentType;
  filePath: string;
  status: DocumentStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}
