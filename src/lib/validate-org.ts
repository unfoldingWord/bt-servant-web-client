const DEFAULT_ORG = process.env.DEFAULT_ORG || "unfoldingWord";
const ORG_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

export function validateOrg(value: string | null | undefined): string {
  if (value && ORG_PATTERN.test(value)) {
    return value;
  }
  return DEFAULT_ORG;
}
