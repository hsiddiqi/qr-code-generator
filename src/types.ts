export type QrType =
  | 'url'
  | 'contact'
  | 'wifi'
  | 'menu'
  | 'text'
  | 'email'
  | 'phone'
  | 'sms'
  | 'event'
  | 'location'
  | 'app'
  | 'social'
  | 'payment';

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export type QrProject = {
  id: string;
  name: string;
  category: string;
  type: QrType;
  fields: Record<string, string>;
  foreground: string;
  background: string;
  size: number;
  errorCorrection: ErrorCorrectionLevel;
  logoUri?: string;
  createdAt: string;
  updatedAt: string;
};

export type QrTypeDefinition = {
  id: QrType;
  label: string;
  description: string;
  defaultName: string;
  category: string;
  fields: QrFieldDefinition[];
};

export type QrFieldDefinition = {
  key: string;
  label: string;
  placeholder: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'url' | 'numbers-and-punctuation';
  multiline?: boolean;
  required?: boolean;
};

export type ValidationResult = {
  ok: boolean;
  message?: string;
};
