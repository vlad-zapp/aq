/** Well-known symbol marking an array as a multi-document container (e.g. YAML ---). */
export const MULTI_DOC = Symbol.for("aq:multi-document");

export class ParsedData {
  documents: unknown[] = [];
  isMultiDocument: boolean = false;
  sourceFormat?: string;

  constructor(
    documents: unknown[] = [],
    options?: { isMultiDocument?: boolean; sourceFormat?: string },
  ) {
    this.documents = documents;
    this.isMultiDocument = options?.isMultiDocument ?? documents.length > 1;
    this.sourceFormat = options?.sourceFormat;
  }
}
